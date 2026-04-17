from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.v1.deps import get_current_user_id
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.models.session import SessionStatus, SessionType
from app.schemas.session import (
    NearbySearchParams,
    SessionCreate,
    SessionRead,
    SessionStatusUpdate,
    SessionUpdate,
)
from app.services.nearby_sessions_cache import NearbySessionsCacheService
from app.services.session_service import SessionService

router = APIRouter()


def get_session_service(db: AsyncIOMotorDatabase = Depends(get_db)) -> SessionService:
    return SessionService(db)


def get_cache(request: Request, settings: Settings = Depends(get_settings)) -> NearbySessionsCacheService:
    redis = getattr(request.app.state, "redis", None)
    return NearbySessionsCacheService(redis, settings)


@router.post("/", response_model=SessionRead, status_code=201)
async def create_session(
    payload: SessionCreate,
    user_id: UUID = Depends(get_current_user_id),
    service: SessionService = Depends(get_session_service),
) -> SessionRead:
    return await service.create_session(host_id=user_id, data=payload)


@router.get("/nearby", response_model=list[SessionRead])
async def nearby_sessions(
    longitude: float = Query(..., ge=-180, le=180),
    latitude: float = Query(..., ge=-90, le=90),
    radius_km: float = Query(default=10.0, gt=0, le=100),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session_type: SessionType | None = Query(default=None),
    min_price: float | None = Query(default=None, ge=0),
    max_price: float | None = Query(default=None, ge=0),
    subject_tags: list[str] | None = Query(default=None),
    _: UUID = Depends(get_current_user_id),
    service: SessionService = Depends(get_session_service),
    cache: NearbySessionsCacheService = Depends(get_cache),
) -> list[SessionRead]:
    params = NearbySearchParams(
        longitude=longitude,
        latitude=latitude,
        radius_km=radius_km,
        limit=limit,
        offset=offset,
        session_type=session_type,
        min_price=min_price,
        max_price=max_price,
        subject_tags=subject_tags,
    )
    return await service.nearby(params=params, cache=cache)


@router.get("/my", response_model=list[SessionRead])
async def my_sessions(
    user_id: UUID = Depends(get_current_user_id),
    service: SessionService = Depends(get_session_service),
) -> list[SessionRead]:
    return await service.list_by_host(host_id=user_id)


@router.get("/{session_id}", response_model=SessionRead)
async def get_session(
    session_id: UUID,
    _: UUID = Depends(get_current_user_id),
    service: SessionService = Depends(get_session_service),
) -> SessionRead:
    return await service.get_session(session_id)


@router.patch("/{session_id}", response_model=SessionRead)
async def update_session(
    session_id: UUID,
    payload: SessionUpdate,
    user_id: UUID = Depends(get_current_user_id),
    service: SessionService = Depends(get_session_service),
) -> SessionRead:
    return await service.update_session(session_id, requester_id=user_id, data=payload)


@router.patch("/{session_id}/cancel", response_model=SessionRead)
async def cancel_session(
    session_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    service: SessionService = Depends(get_session_service),
) -> SessionRead:
    return await service.cancel_session(session_id, requester_id=user_id)


@router.patch("/{session_id}/status", response_model=SessionRead)
async def update_session_status(
    session_id: UUID,
    payload: SessionStatusUpdate,
    user_id: UUID = Depends(get_current_user_id),
    service: SessionService = Depends(get_session_service),
) -> SessionRead:
    return await service.update_status(session_id, requester_id=user_id, new_status=payload.status)


@router.post("/{session_id}/join", response_model=SessionRead)
async def join_session(
    session_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    service: SessionService = Depends(get_session_service),
) -> SessionRead:
    return await service.join_free_session(session_id=session_id, user_id=user_id)


@router.post("/{session_id}/leave", response_model=SessionRead)
async def leave_session(
    session_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    service: SessionService = Depends(get_session_service),
) -> SessionRead:
    return await service.leave_session(session_id, user_id)


@router.get("/{session_id}/participants", response_model=list[UUID])
async def get_participants(
    session_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    service: SessionService = Depends(get_session_service),
) -> list[UUID]:
    return await service.get_participants(session_id, requester_id=user_id)
