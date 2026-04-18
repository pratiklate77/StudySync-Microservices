from __future__ import annotations
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Float, and_, cast, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tutor_profile import TutorProfile


class TutorRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_user_id(self, user_id: UUID) -> TutorProfile | None:
        result = await self._session.execute(
            select(TutorProfile).where(TutorProfile.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, tutor_id: UUID) -> TutorProfile | None:
        result = await self._session.execute(
            select(TutorProfile).where(TutorProfile.id == tutor_id)
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        *,
        user_id: UUID,
        bio: str | None,
        expertise: list[str],
        hourly_rate: Decimal,
    ) -> TutorProfile:
        profile = TutorProfile(
            user_id=user_id,
            bio=bio,
            expertise=expertise,
            hourly_rate=hourly_rate,
        )
        self._session.add(profile)
        await self._session.flush()
        await self._session.refresh(profile)
        return profile

    async def set_verified(self, profile: TutorProfile, verified: bool) -> TutorProfile:
        profile.is_verified = verified
        await self._session.flush()
        await self._session.refresh(profile)
        return profile

    async def increment_rating(self, user_id: UUID, score: int) -> int:
        stmt = (
            update(TutorProfile)
            .where(
                TutorProfile.user_id == user_id,
                TutorProfile.is_active.is_(True),
            )
            .values(
                rating_sum=TutorProfile.rating_sum + score,
                total_reviews=TutorProfile.total_reviews + 1,
            )
        )
        result = await self._session.execute(stmt)
        return int(result.rowcount or 0)

    async def list_top_candidates(self, limit: int = 20) -> list[TutorProfile]:
        avg_expr = func.coalesce(
            cast(TutorProfile.rating_sum, Float)
            / func.nullif(TutorProfile.total_reviews, 0),
            0.0,
        )
        result = await self._session.execute(
            select(TutorProfile)
            .where(
                TutorProfile.is_active.is_(True),
                TutorProfile.is_verified.is_(True),
            )
            .order_by(avg_expr.desc(), TutorProfile.total_reviews.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def search(
        self,
        *,
        expertise_tags: list[str] | None = None,
        min_rating: float | None = None,
        verified_only: bool = False,
        limit: int = 20,
        offset: int = 0,
    ) -> list[TutorProfile]:
        """Search tutors with optional filters."""
        avg_expr = func.coalesce(
            cast(TutorProfile.rating_sum, Float)
            / func.nullif(TutorProfile.total_reviews, 0),
            0.0,
        )
        
        filters = [TutorProfile.is_active.is_(True)]
        
        if verified_only:
            filters.append(TutorProfile.is_verified.is_(True))
        
        if expertise_tags:
            # Match if any expertise tag overlaps
            filters.append(
                func.array_overlap(TutorProfile.expertise, expertise_tags)
            )
        
        if min_rating is not None:
            filters.append(avg_expr >= min_rating)
        
        result = await self._session.execute(
            select(TutorProfile)
            .where(and_(*filters))
            .order_by(avg_expr.desc(), TutorProfile.total_reviews.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def update(
        self,
        tutor_id: UUID,
        *,
        bio: str | None = None,
        expertise: list[str] | None = None,
        hourly_rate: Decimal | None = None,
    ) -> TutorProfile | None:
        """Update tutor profile fields."""
        values = {}
        if bio is not None:
            values["bio"] = bio
        if expertise is not None:
            values["expertise"] = expertise
        if hourly_rate is not None:
            values["hourly_rate"] = hourly_rate
        
        if not values:
            return await self.get_by_id(tutor_id)
        
        stmt = (
            update(TutorProfile)
            .where(TutorProfile.id == tutor_id)
            .values(**values)
        )
        await self._session.execute(stmt)
        await self._session.flush()
        return await self.get_by_id(tutor_id)

    async def soft_delete(self, tutor_id: UUID) -> TutorProfile | None:
        """Soft delete by marking as inactive."""
        stmt = (
            update(TutorProfile)
            .where(TutorProfile.id == tutor_id)
            .values(is_active=False)
        )
        await self._session.execute(stmt)
        await self._session.flush()
        return await self.get_by_id(tutor_id)
