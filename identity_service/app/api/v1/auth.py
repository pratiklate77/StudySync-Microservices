from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.auth import Token, UserLogin, UserProfileRead, UserProfileUpdate, UserRead, UserRegister
from app.services.auth_service import AuthService

router = APIRouter()


def get_auth_service(db: AsyncSession = Depends(get_db)) -> AuthService:
    return AuthService(db)


@router.post("/register", response_model=UserRead, status_code=201)
async def register(
    payload: UserRegister,
    service: AuthService = Depends(get_auth_service),
) -> UserRead:
    user = await service.register(payload)
    return UserRead.model_validate(user)


@router.post("/login", response_model=Token)
async def login(
    payload: UserLogin,
    service: AuthService = Depends(get_auth_service),
) -> Token:
    token, _user = await service.login(payload)
    return Token(access_token=token)


@router.get("/profile", response_model=UserProfileRead)
async def get_profile(
    current_user: User = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
) -> UserProfileRead:
    """Get current user profile with tutor info if available."""
    user = await service.get_profile(current_user.id)
    return UserProfileRead.model_validate(user, from_attributes=True)


@router.patch("/profile", response_model=UserProfileRead)
async def update_profile(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
) -> UserProfileRead:
    """Update user profile (location)."""
    user = await service.update_profile(current_user.id, payload)
    return UserProfileRead.model_validate(user, from_attributes=True)
