from uuid import UUID

from fastapi import APIRouter, Depends, Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.kafka.producer import ResilientKafkaProducer
from app.models.user import User
from app.schemas.auth import RefreshRequest, Token, UserLogin, UserProfileRead, UserProfileUpdate, UserRead, UserRegister
from app.services.auth_service import AuthService

router = APIRouter()


def get_kafka_publisher(request: Request) -> ResilientKafkaProducer:
    return request.app.state.kafka_publisher


def get_redis(request: Request) -> Redis:
    return request.app.state.redis


def get_auth_service(
    request: Request,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AuthService:
    return AuthService(
        db,
        event_publisher=get_kafka_publisher(request),
        settings=settings,
        redis=get_redis(request),
    )


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
    access_token, refresh_token, _user = await service.login(payload)
    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=Token)
async def refresh(
    payload: RefreshRequest,
    service: AuthService = Depends(get_auth_service),
) -> Token:
    access_token, refresh_token = await service.refresh_tokens(payload.refresh_token)
    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/logout", status_code=204)
async def logout(
    payload: RefreshRequest,
    service: AuthService = Depends(get_auth_service),
) -> None:
    await service.logout(payload.refresh_token)


@router.get("/profile", response_model=UserProfileRead)
async def get_profile(
    current_user: User = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
) -> UserProfileRead:
    user = await service.get_profile(current_user.id)
    return UserProfileRead.model_validate(user, from_attributes=True)


@router.patch("/profile", response_model=UserProfileRead)
async def update_profile(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
) -> UserProfileRead:
    user = await service.update_profile(current_user.id, payload)
    return UserProfileRead.model_validate(user, from_attributes=True)
