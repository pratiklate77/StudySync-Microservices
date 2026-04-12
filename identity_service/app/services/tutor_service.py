from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from aiokafka import AIOKafkaProducer
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.events.kafka_producer import publish_tutor_verified
from app.models.tutor_profile import TutorProfile
from app.models.user import User, UserRole
from app.repositories.tutor_repository import TutorRepository
from app.repositories.user_repository import UserRepository
from app.schemas.tutor import TutorBecome, TutorProfileRead
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
        producer: AIOKafkaProducer,
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
