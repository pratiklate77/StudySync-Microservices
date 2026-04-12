from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.schemas.auth import UserLogin, UserRegister


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._users = UserRepository(session)

    async def register(self, data: UserRegister) -> User:
        try:
            user = await self._users.create(
                email=data.email.lower(),
                password_hash=hash_password(data.password),
                role=UserRole.user,
            )
            await self._session.commit()
            await self._session.refresh(user)
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
