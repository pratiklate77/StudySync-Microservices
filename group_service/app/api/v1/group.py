from uuid import UUID

from aiokafka import AIOKafkaProducer
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user_id, get_kafka_producer
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.schemas.group import GroupCreate, GroupRead, GroupUpdate
from app.services.group_service import GroupService

router = APIRouter()


def get_group_service(db: AsyncSession = Depends(get_db)) -> GroupService:
    return GroupService(db)


@router.post("/", response_model=GroupRead, status_code=201)
async def create_group(
    payload: GroupCreate,
    user_id: UUID = Depends(get_current_user_id),
    service: GroupService = Depends(get_group_service),
    producer: AIOKafkaProducer = Depends(get_kafka_producer),
    settings: Settings = Depends(get_settings),
) -> GroupRead:
    return await service.create_group(owner_id=user_id, data=payload, producer=producer, settings=settings)


@router.get("/", response_model=list[GroupRead])
async def list_groups(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None, max_length=200),
    _: UUID = Depends(get_current_user_id),
    service: GroupService = Depends(get_group_service),
) -> list[GroupRead]:
    return await service.list_groups(limit=limit, offset=offset, search=search)


@router.get("/{group_id}", response_model=GroupRead)
async def get_group(
    group_id: UUID,
    _: UUID = Depends(get_current_user_id),
    service: GroupService = Depends(get_group_service),
) -> GroupRead:
    return await service.get_group(group_id)


@router.patch("/{group_id}", response_model=GroupRead)
async def update_group(
    group_id: UUID,
    payload: GroupUpdate,
    user_id: UUID = Depends(get_current_user_id),
    service: GroupService = Depends(get_group_service),
) -> GroupRead:
    return await service.update_group(group_id, requester_id=user_id, data=payload)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    service: GroupService = Depends(get_group_service),
    producer: AIOKafkaProducer = Depends(get_kafka_producer),
    settings: Settings = Depends(get_settings),
) -> None:
    await service.delete_group(group_id, requester_id=user_id, producer=producer, settings=settings)
