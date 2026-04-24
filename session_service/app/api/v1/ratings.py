from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.v1.deps import get_current_user_id
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.kafka.producer import ResilientKafkaProducer
from app.schemas.rating import RatingRead, RatingSubmit
from app.services.rating_service import RatingService

router = APIRouter()


def get_rating_service(db: AsyncIOMotorDatabase = Depends(get_db)) -> RatingService:
    return RatingService(db)


def get_kafka_producer(request: Request) -> ResilientKafkaProducer:
    producer = getattr(request.app.state, "kafka_producer", None)
    if producer is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kafka producer is not available",
        )
    return producer


@router.post("/{session_id}/ratings", response_model=RatingRead, status_code=201)
async def submit_rating(
    session_id: UUID,
    payload: RatingSubmit,
    user_id: UUID = Depends(get_current_user_id),
    service: RatingService = Depends(get_rating_service),
    producer: ResilientKafkaProducer = Depends(get_kafka_producer),
    settings: Settings = Depends(get_settings),
) -> RatingRead:
    return await service.submit(
        session_id=session_id,
        student_id=user_id,
        data=payload,
        producer=producer,
        settings=settings,
    )


@router.get("/{session_id}/ratings", response_model=list[RatingRead])
async def get_session_ratings(
    session_id: UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _: UUID = Depends(get_current_user_id),
    service: RatingService = Depends(get_rating_service),
) -> list[RatingRead]:
    return await service.list_for_session(session_id, limit=limit, offset=offset)
