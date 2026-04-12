import secrets
from uuid import UUID

from aiokafka import AIOKafkaProducer
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.models.user import User
from app.schemas.tutor import TutorBecome, TutorProfileRead
from app.services.top_tutors_cache import TopTutorsCacheService
from app.services.tutor_service import TutorService

router = APIRouter()


def get_tutor_service(db: AsyncSession = Depends(get_db)) -> TutorService:
    return TutorService(db)


def get_cache(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> TopTutorsCacheService:
    redis = getattr(request.app.state, "redis", None)
    return TopTutorsCacheService(redis, settings)


def get_kafka_producer(request: Request) -> AIOKafkaProducer:
    producer = getattr(request.app.state, "kafka_producer", None)
    if producer is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kafka producer is not available",
        )
    return producer


@router.post("/become", response_model=TutorProfileRead, status_code=201)
async def become_tutor(
    payload: TutorBecome,
    current_user: User = Depends(get_current_user),
    service: TutorService = Depends(get_tutor_service),
) -> TutorProfileRead:
    expertise = [e.strip()[:128] for e in payload.expertise if e.strip()][:50]
    normalized = TutorBecome(
        bio=payload.bio,
        expertise=expertise,
        hourly_rate=payload.hourly_rate,
    )
    profile = await service.become_tutor(current_user, normalized)
    return TutorProfileRead.model_validate(profile, from_attributes=True)


@router.get("/leaderboard", response_model=list[TutorProfileRead])
async def top_tutors_leaderboard(
    service: TutorService = Depends(get_tutor_service),
    cache: TopTutorsCacheService = Depends(get_cache),
    settings: Settings = Depends(get_settings),
    limit: int = 20,
) -> list[TutorProfileRead]:
    if limit < 1 or limit > 50:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "limit must be between 1 and 50")
    return await service.leaderboard(settings=settings, cache=cache, limit=limit)


@router.post("/{user_id}/verify", response_model=TutorProfileRead)
async def verify_tutor_admin(
    user_id: UUID,
    service: TutorService = Depends(get_tutor_service),
    producer: AIOKafkaProducer = Depends(get_kafka_producer),
    cache: TopTutorsCacheService = Depends(get_cache),
    settings: Settings = Depends(get_settings),
    x_admin_api_key: str | None = Header(default=None, alias="X-Admin-API-Key"),
) -> TutorProfileRead:
    if not settings.admin_api_key:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin verification is not configured",
        )
    expected = settings.admin_api_key
    if x_admin_api_key is None or len(x_admin_api_key) != len(expected):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Invalid admin credentials")
    if not secrets.compare_digest(x_admin_api_key, expected):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Invalid admin credentials")
    profile = await service.verify_tutor(
        target_user_id=user_id,
        producer=producer,
        settings=settings,
        cache=cache,
    )
    return TutorProfileRead.model_validate(profile, from_attributes=True)
