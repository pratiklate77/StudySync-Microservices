from __future__ import annotations
import secrets
from uuid import UUID

from aiokafka import AIOKafkaProducer
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.models.user import User
from app.schemas.tutor import (
    TutorBecome,
    TutorProfileRead,
    TutorProfileUpdate,
    TutorSearchParams,
    TutorStatsRead,
)
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
    limit: int = Query(20, ge=1, le=50),
) -> list[TutorProfileRead]:
    return await service.leaderboard(settings=settings, cache=cache, limit=limit)


@router.get("/search", response_model=list[TutorProfileRead])
async def search_tutors(
    expertise: list[str] | None = Query(None, description="Filter by expertise tags"),
    min_rating: float | None = Query(None, ge=0, le=5),
    verified_only: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    _: User = Depends(get_current_user),
    service: TutorService = Depends(get_tutor_service),
) -> list[TutorProfileRead]:
    """Search tutors with optional filters."""
    return await service.search_tutors(
        expertise_tags=expertise,
        min_rating=min_rating,
        verified_only=verified_only,
        limit=limit,
        offset=offset,
    )


@router.patch("/profile", response_model=TutorProfileRead)
async def update_tutor_profile(
    payload: TutorProfileUpdate,
    current_user: User = Depends(get_current_user),
    service: TutorService = Depends(get_tutor_service),
) -> TutorProfileRead:
    """Update own tutor profile (bio, expertise, hourly_rate)."""
    profile = await service.get_tutor_by_user_id(current_user.id)
    return await service.update_tutor_profile(profile.id, current_user.id, payload)


@router.delete("/profile", response_model=TutorProfileRead)
async def delete_tutor_profile(
    current_user: User = Depends(get_current_user),
    service: TutorService = Depends(get_tutor_service),
) -> TutorProfileRead:
    """Soft delete own tutor profile."""
    profile = await service.get_tutor_by_user_id(current_user.id)
    return await service.delete_tutor_profile(profile.id, current_user.id)


@router.get("/{tutor_id}/stats", response_model=TutorStatsRead)
async def get_tutor_stats(
    tutor_id: UUID,
    _: User = Depends(get_current_user),
    service: TutorService = Depends(get_tutor_service),
) -> TutorStatsRead:
    """Get tutor statistics including rating info."""
    return await service.get_tutor_stats(tutor_id)


@router.get("/{tutor_id}", response_model=TutorProfileRead)
async def get_tutor(
    tutor_id: UUID,
    _: User = Depends(get_current_user),
    service: TutorService = Depends(get_tutor_service),
) -> TutorProfileRead:
    """Get a specific tutor profile by ID."""
    return await service.get_tutor_by_id(tutor_id)


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
