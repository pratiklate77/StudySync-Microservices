from __future__ import annotations
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.events.kafka_producer import publish_tutor_verified
from app.kafka.producer import ResilientKafkaProducer
from app.models.tutor_profile import TutorProfile
from app.models.user import User, UserRole
from app.repositories.tutor_repository import TutorRepository
from app.repositories.user_repository import UserRepository
from app.schemas.tutor import TutorBecome, TutorProfileRead, TutorProfileUpdate, TutorStatsRead
from app.services.top_tutors_cache import TopTutorsCacheService


class TutorService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._tutors = TutorRepository(session)
        self._users = UserRepository(session)

    async def become_tutor(self, user: User, data: TutorBecome) -> TutorProfile:
        if not user.is_active:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Inactive user")
        existing = await self._tutors.get_by_user_id(user.id)
        if existing is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="User already has a tutor profile",
            )
        money = Decimal("0.01")
        hourly = data.hourly_rate.quantize(money, rounding=ROUND_HALF_UP)
        profile = await self._tutors.create(
            user_id=user.id,
            bio=data.bio,
            expertise=list(data.expertise),
            hourly_rate=hourly,
        )
        await self._users.set_role(user, UserRole.tutor)
        await self._session.commit()
        await self._session.refresh(profile)
        return profile

    async def verify_tutor(
        self,
        *,
        target_user_id: UUID,
        producer: ResilientKafkaProducer,
        settings: Settings,
        cache: TopTutorsCacheService,
    ) -> TutorProfile:
        profile = await self._tutors.get_by_user_id(target_user_id)
        if profile is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tutor profile not found")
        if profile.is_verified:
            return profile
        await self._tutors.set_verified(profile, True)
        await self._session.commit()
        await self._session.refresh(profile)
        await publish_tutor_verified(producer, settings, user_id=profile.user_id)
        await cache.invalidate()
        return profile

    async def apply_rating_from_event(self, *, tutor_user_id: str, score: int) -> bool:
        try:
            uid = UUID(tutor_user_id)
        except ValueError:
            return False
        if score < 1 or score > 5:
            return False
        updated = await self._tutors.increment_rating(uid, score)
        return updated > 0

    async def leaderboard(
        self,
        *,
        settings: Settings,
        cache: TopTutorsCacheService,
        limit: int = 20,
    ) -> list[TutorProfileRead]:
        cached = await cache.get_cached_payload()
        if cached:
            entries = cache.deserialize_entries(cached)
            return [TutorProfileRead.model_validate(e) for e in entries]
        rows = await self._tutors.list_top_candidates(limit=limit)
        payload = [TutorProfileRead.model_validate(r, from_attributes=True).model_dump(mode="json") for r in rows]
        await cache.set_cached_payload(cache.serialize_entries(payload))
        return [TutorProfileRead.model_validate(r, from_attributes=True) for r in rows]

    async def get_tutor_by_id(self, tutor_id: UUID) -> TutorProfileRead:
        """Get a specific tutor profile by ID."""
        profile = await self._tutors.get_by_id(tutor_id)
        if profile is None or not profile.is_active:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tutor profile not found")
        return TutorProfileRead.model_validate(profile, from_attributes=True)

    async def get_tutor_by_user_id(self, user_id: UUID) -> TutorProfileRead:
        """Get tutor profile by user ID."""
        profile = await self._tutors.get_by_user_id(user_id)
        if profile is None or not profile.is_active:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tutor profile not found")
        return TutorProfileRead.model_validate(profile, from_attributes=True)

    async def search_tutors(
        self,
        *,
        expertise_tags: list[str] | None = None,
        min_rating: float | None = None,
        verified_only: bool = False,
        limit: int = 20,
        offset: int = 0,
    ) -> list[TutorProfileRead]:
        """Search tutors with filters."""
        rows = await self._tutors.search(
            expertise_tags=expertise_tags,
            min_rating=min_rating,
            verified_only=verified_only,
            limit=limit,
            offset=offset,
        )
        return [TutorProfileRead.model_validate(r, from_attributes=True) for r in rows]

    async def update_tutor_profile(
        self,
        tutor_id: UUID,
        requester_id: UUID,
        data: TutorProfileUpdate,
    ) -> TutorProfileRead:
        """Update tutor profile (self only)."""
        profile = await self._tutors.get_by_id(tutor_id)
        if profile is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tutor profile not found")
        if profile.user_id != requester_id:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="You can only update your own profile",
            )
        
        # Normalize hourly rate if provided
        hourly_rate = data.hourly_rate
        if hourly_rate is not None:
            money = Decimal("0.01")
            hourly_rate = hourly_rate.quantize(money, rounding=ROUND_HALF_UP)
        
        updated = await self._tutors.update(
            tutor_id,
            bio=data.bio,
            expertise=data.expertise,
            hourly_rate=hourly_rate,
        )
        if updated is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Failed to update profile")
        await self._session.commit()
        await self._session.refresh(updated)
        return TutorProfileRead.model_validate(updated, from_attributes=True)

    async def delete_tutor_profile(self, tutor_id: UUID, requester_id: UUID) -> TutorProfileRead:
        """Soft delete tutor profile (self only)."""
        profile = await self._tutors.get_by_id(tutor_id)
        if profile is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tutor profile not found")
        if profile.user_id != requester_id:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="You can only delete your own profile",
            )
        
        deleted = await self._tutors.soft_delete(tutor_id)
        await self._session.commit()
        await self._session.refresh(deleted)
        return TutorProfileRead.model_validate(deleted, from_attributes=True)

    async def get_tutor_stats(self, tutor_id: UUID) -> TutorStatsRead:
        """Get tutor statistics and rating info."""
        profile = await self._tutors.get_by_id(tutor_id)
        if profile is None or not profile.is_active:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tutor profile not found")
        
        # Calculate average rating
        average = 0.0
        if profile.total_reviews > 0:
            average = profile.rating_sum / profile.total_reviews
        
        return TutorStatsRead(
            id=profile.id,
            user_id=profile.user_id,
            bio=profile.bio,
            expertise=profile.expertise,
            hourly_rate=profile.hourly_rate,
            is_verified=profile.is_verified,
            average_rating=average,
            total_reviews=profile.total_reviews,
            rating_sum=profile.rating_sum,
        )
