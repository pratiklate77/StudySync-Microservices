import logging
from uuid import UUID

from fastapi import HTTPException, status
from redis.asyncio import Redis
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.kafka.producer import ResilientKafkaProducer
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.schemas.auth import UserLogin, UserProfileUpdate, UserRegister

logger = logging.getLogger(__name__)

_REFRESH_KEY_PREFIX = "refresh:"


class AuthService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        event_publisher: ResilientKafkaProducer,
        settings: Settings,
        redis: Redis,
    ) -> None:
        self._session = session
        self._users = UserRepository(session)
        self._event_publisher = event_publisher
        self._settings = settings
        self._redis = redis

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

    async def login(self, data: UserLogin) -> tuple[str, str, User]:
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
        access_token = create_access_token(UUID(str(user.id)))
        refresh_token, jti = create_refresh_token(UUID(str(user.id)))
        ttl = self._settings.jwt_refresh_token_expire_days * 86400
        await self._redis.setex(f"{_REFRESH_KEY_PREFIX}{jti}", ttl, str(user.id))
        return access_token, refresh_token, user

    async def refresh_tokens(self, refresh_token: str) -> tuple[str, str]:
        """Validate refresh token, revoke old jti, issue new token pair."""
        try:
            payload = decode_token(refresh_token)
            if payload.get("type") != "refresh":
                raise ValueError("not a refresh token")
            jti = payload.get("jti")
            sub = payload.get("sub")
            if not jti or not sub:
                raise ValueError("missing jti or sub")
        except Exception:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

        stored = await self._redis.get(f"{_REFRESH_KEY_PREFIX}{jti}")
        if stored is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked or expired")

        # Revoke old jti and issue a fresh pair (rotation)
        await self._redis.delete(f"{_REFRESH_KEY_PREFIX}{jti}")
        user_id = UUID(sub)
        new_access = create_access_token(user_id)
        new_refresh, new_jti = create_refresh_token(user_id)
        ttl = self._settings.jwt_refresh_token_expire_days * 86400
        await self._redis.setex(f"{_REFRESH_KEY_PREFIX}{new_jti}", ttl, str(user_id))
        return new_access, new_refresh

    async def logout(self, refresh_token: str) -> None:
        """Revoke refresh token. Access token expires naturally."""
        try:
            payload = decode_token(refresh_token)
            jti = payload.get("jti")
            if jti:
                await self._redis.delete(f"{_REFRESH_KEY_PREFIX}{jti}")
        except Exception:
            pass  # already expired or invalid — logout is a no-op

    async def update_profile(self, user_id: UUID, data: UserProfileUpdate) -> User:
        updated = await self._users.update_location(
            user_id,
            latitude=data.last_known_latitude,
            longitude=data.last_known_longitude,
        )
        if updated is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        await self._session.commit()
        user = await self._users.get_by_id_with_tutor(user_id)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return user

    async def get_profile(self, user_id: UUID) -> User:
        user = await self._users.get_by_id_with_tutor(user_id)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return user
