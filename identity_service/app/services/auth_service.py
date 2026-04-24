import logging
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password, verify_password
from app.kafka.producer import ResilientKafkaProducer
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.core.config import Settings
from app.schemas.auth import UserLogin, UserProfileUpdate, UserRegister

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        event_publisher: ResilientKafkaProducer,
        settings: Settings,
    ) -> None:
        self._session = session
        self._users = UserRepository(session)
        self._event_publisher = event_publisher
        self._settings = settings

    async def register(self, data: UserRegister) -> User:
        try:
            user = await self._users.create(
                email=data.email.lower(),
                password_hash=hash_password(data.password),
                role=UserRole.user,
            )
            await self._session.commit()
            await self._session.refresh(user)
            published = await self._event_publisher.publish(
                topic=self._settings.kafka_user_events_topic,
                value={
                    "event_type": "USER_CREATED",
                    "user_id": str(user.id),
                    "email": user.email,
                    "role": user.role.value,
                },
                key=str(user.id).encode("utf-8"),
            )
            if not published:
                logger.warning("USER_CREATED queued for retry user_id=%s", user.id)
            return user
        except IntegrityError:
            await self._session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            ) from None

    async def login(self, data: UserLogin) -> tuple[str, User]:
        user = await self._users.get_by_email(data.email.lower())
        if user is None or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
            )
        if not verify_password(data.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
            )
        token = create_access_token(UUID(str(user.id)))
        return token, user

    async def update_profile(self, user_id: UUID, data: UserProfileUpdate) -> User:
        """Update user profile (location)."""
        updated = await self._users.update_location(
            user_id,
            latitude=data.last_known_latitude,
            longitude=data.last_known_longitude,
        )
        if updated is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        await self._session.commit()
        # Reload with joined tutor_profile so response serialization doesn't trigger lazy-load IO.
        user = await self._users.get_by_id_with_tutor(user_id)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return user

    async def get_profile(self, user_id: UUID) -> User:
        """Get user profile with tutor info if available."""
        user = await self._users.get_by_id_with_tutor(user_id)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return user
