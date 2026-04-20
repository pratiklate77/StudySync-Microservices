from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.session import GeoPoint, Session, SessionStatus, SessionType
from app.repositories.session_repository import SessionRepository
from app.repositories.verified_tutor_repository import VerifiedTutorRepository
from app.schemas.session import NearbySearchParams, SessionCreate, SessionRead, SessionUpdate
from app.services.nearby_sessions_cache import NearbySessionsCacheService


def _to_read(s: Session) -> SessionRead:
    return SessionRead(
        id=s.id,
        host_id=s.host_id,
        title=s.title,
        description=s.description,
        session_type=s.session_type,
        price=s.price,
        max_participants=s.max_participants,
        participant_count=len(s.participants),
        status=s.status,
        scheduled_time=s.scheduled_time,
        longitude=s.location.coordinates[0],
        latitude=s.location.coordinates[1],
        subject_tags=s.subject_tags,
        created_at=s.created_at,
    )


class SessionService:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._sessions = SessionRepository(db)
        self._verified_tutors = VerifiedTutorRepository(db)

    async def create_session(self, host_id: UUID, data: SessionCreate) -> SessionRead:
        if data.session_type == SessionType.paid:
            if not await self._verified_tutors.is_verified(host_id):
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN,
                    detail="Only verified tutors can create paid sessions",
                )
        if data.session_type == SessionType.free and data.price > 0:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Free sessions cannot have a price",
            )
        session = Session(
            host_id=host_id,
            title=data.title,
            description=data.description,
            session_type=data.session_type,
            price=data.price,
            max_participants=data.max_participants,
            scheduled_time=data.scheduled_time,
            location=GeoPoint(coordinates=[data.location.longitude, data.location.latitude]),
            subject_tags=data.subject_tags,
        )
        return _to_read(await self._sessions.create(session))

    async def get_session(self, session_id: UUID) -> SessionRead:
        return _to_read(await self._get_or_404(session_id))

    async def update_session(
        self, session_id: UUID, requester_id: UUID, data: SessionUpdate
    ) -> SessionRead:
        session = await self._get_or_404(session_id)
        if session.host_id != requester_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Only the host can update this session")
        if session.status not in (SessionStatus.scheduled,):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="Only scheduled sessions can be updated",
            )
        fields = data.model_dump(exclude_none=True)
        if not fields:
            return _to_read(session)
        updated = await self._sessions.update(session_id, fields)
        return _to_read(updated)  # type: ignore[arg-type]

    async def cancel_session(self, session_id: UUID, requester_id: UUID) -> SessionRead:
        session = await self._get_or_404(session_id)
        if session.host_id != requester_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Only the host can cancel this session")
        if session.status == SessionStatus.cancelled:
            return _to_read(session)
        if session.status not in (SessionStatus.scheduled, SessionStatus.active):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="Completed sessions cannot be cancelled",
            )
        updated = await self._sessions.set_status(session_id, SessionStatus.cancelled)
        return _to_read(updated)  # type: ignore[arg-type]

    async def update_status(
        self, session_id: UUID, requester_id: UUID, new_status: SessionStatus
    ) -> SessionRead:
        session = await self._get_or_404(session_id)
        if session.host_id != requester_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Only the host can change session status")
        if not SessionRepository.is_valid_transition(session.status, new_status):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail=f"Cannot transition from '{session.status}' to '{new_status}'",
            )
        updated = await self._sessions.set_status(session_id, new_status)
        return _to_read(updated)  # type: ignore[arg-type]

    async def join_free_session(self, session_id: UUID, user_id: UUID) -> SessionRead:
        session = await self._get_or_404(session_id)
        if session.session_type != SessionType.free:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Use the payment flow to join paid sessions",
            )
        if session.status != SessionStatus.scheduled:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Session is not open for joining")
        if user_id in session.participants:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Already joined this session")
        if not await self._sessions.add_participant(session_id, user_id):
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Session is full")
        return _to_read(await self._get_or_404(session_id))

    async def leave_session(self, session_id: UUID, user_id: UUID) -> SessionRead:
        session = await self._get_or_404(session_id)
        if session.status in (SessionStatus.completed, SessionStatus.cancelled):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="Cannot leave a completed or cancelled session",
            )
        if user_id not in session.participants:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="You are not a participant")
        await self._sessions.remove_participant(session_id, user_id)
        return _to_read(await self._get_or_404(session_id))

    async def get_participants(self, session_id: UUID, requester_id: UUID) -> list[UUID]:
        session = await self._get_or_404(session_id)
        if session.host_id != requester_id:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="Only the host can view the participant list",
            )
        participants = await self._sessions.get_participants(session_id)
        return participants or []

    async def add_paid_participant(self, session_id: UUID, student_id: UUID) -> bool:
        session = await self._sessions.get_by_id(session_id)
        if session is None or session.session_type != SessionType.paid:
            return False
        return await self._sessions.add_participant(session_id, student_id)

    async def nearby(
        self,
        params: NearbySearchParams,
        cache: NearbySessionsCacheService,
    ) -> list[SessionRead]:
        # Only cache the default (no filters, no offset) query
        use_cache = (
            params.session_type is None
            and params.min_price is None
            and params.max_price is None
            and params.subject_tags is None
            and params.offset == 0
        )
        if use_cache:
            cached = await cache.get(params.longitude, params.latitude, params.radius_km)
            if cached:
                raw = cache.deserialize(cached)
                return [SessionRead.model_validate(r) for r in raw]

        sessions = await self._sessions.find_nearby(
            longitude=params.longitude,
            latitude=params.latitude,
            radius_meters=params.radius_km * 1000,
            limit=params.limit,
            offset=params.offset,
            session_type=params.session_type,
            min_price=params.min_price,
            max_price=params.max_price,
            subject_tags=params.subject_tags,
        )
        result = [_to_read(s) for s in sessions]

        if use_cache:
            await cache.set(
                params.longitude,
                params.latitude,
                params.radius_km,
                cache.serialize([r.model_dump(mode="json") for r in result]),
            )
        return result

    async def list_by_host(self, host_id: UUID) -> list[SessionRead]:
        return [_to_read(s) for s in await self._sessions.list_by_host(host_id)]

    async def _get_or_404(self, session_id: UUID) -> Session:
        session = await self._sessions.get_by_id(session_id)
        if session is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Session not found")
        return session
