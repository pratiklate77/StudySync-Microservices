from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.auth import Token, UserLogin, UserRead, UserRegister
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
