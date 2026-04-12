from decimal import Decimal
from uuid import UUID

from sqlalchemy import Float, cast, func, select, update
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
