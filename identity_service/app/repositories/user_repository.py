from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, user_id: UUID) -> User | None:
        result = await self._session.execute(select(User).where(User.id == user_id))
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
