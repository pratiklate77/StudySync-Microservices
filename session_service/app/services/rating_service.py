from uuid import UUID

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import Settings
from app.events.kafka_producer import publish_rating_submitted
from app.kafka.producer import ResilientKafkaProducer
from app.models.rating import Rating
from app.models.session import SessionStatus
from app.repositories.rating_repository import RatingRepository
from app.repositories.session_repository import SessionRepository
from app.schemas.rating import RatingRead, RatingSubmit


class RatingService:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._ratings = RatingRepository(db)
        self._sessions = SessionRepository(db)

    async def submit(
        self,
        session_id: UUID,
        student_id: UUID,
        data: RatingSubmit,
        producer: ResilientKafkaProducer,
        settings: Settings,
    ) -> RatingRead:
        session = await self._sessions.get_by_id(session_id)
        if session is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Session not found")
        if student_id not in session.participants:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="Only session participants can submit a rating",
            )
        if session.status != SessionStatus.completed:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="Ratings can only be submitted for completed sessions",
            )
        already_rated = await self._ratings.exists(session_id, student_id)
        if already_rated:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="You have already rated this session")

        rating = Rating(
            session_id=session_id,
            tutor_id=session.host_id,
            student_id=student_id,
            score=data.score,
            comment=data.comment,
        )
        created = await self._ratings.create(rating)
        if created is None:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="You have already rated this session")

        # Emit RATING_SUBMITTED → consumed by Identity Service to update tutor avg rating
        await publish_rating_submitted(
            producer,
            settings,
            tutor_id=session.host_id,
            student_id=student_id,
            score=data.score,
        )

    async def list_for_session(
        self, session_id: UUID, limit: int = 50, offset: int = 0
    ) -> list[RatingRead]:
        session = await self._sessions.get_by_id(session_id)
        if session is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Session not found")
        ratings = await self._ratings.list_by_session(session_id, limit=limit, offset=offset)
        return [
            RatingRead(
                id=r.id,
                session_id=r.session_id,
                tutor_id=r.tutor_id,
                student_id=r.student_id,
                score=r.score,
                comment=r.comment,
                created_at=r.created_at,
            )
            for r in ratings
        ]
