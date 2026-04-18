from __future__ import annotations
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import User, UserRole


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, user_id: UUID) -> User | None:
        result = await self._session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_id_with_tutor(self, user_id: UUID) -> User | None:
        """Get user with tutor profile loaded (if exists)."""
        result = await self._session.execute(
            select(User)
            .where(User.id == user_id)
            .options(selectinload(User.tutor_profile))
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        result = await self._session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def create(
        self,
        *,
        email: str,
        password_hash: str,
        role: UserRole = UserRole.user,
    ) -> User:
        user = User(email=email, password_hash=password_hash, role=role)
        self._session.add(user)
        await self._session.flush()
        await self._session.refresh(user)
        return user

    async def set_role(self, user: User, role: UserRole) -> User:
        user.role = role
        await self._session.flush()
        await self._session.refresh(user)
        return user

    async def update_location(self, user_id: UUID, latitude: float | None, longitude: float | None) -> User | None:
        """Update user's last known location."""
        stmt = (
            update(User)
            .where(User.id == user_id)
            .values(
                last_known_latitude=latitude,
                last_known_longitude=longitude,
            )
        )
        await self._session.execute(stmt)
        await self._session.flush()
        return await self.get_by_id(user_id)
