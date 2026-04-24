from uuid import UUID

from fastapi import APIRouter, Depends, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.v1.deps import get_current_user_id
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.schemas.message import MessageCreate, MessageEdit, MessageListResponse, MessageRead
from app.services.message_service import MessageService
from app.services.recent_messages_cache import RecentMessagesCacheService

router = APIRouter()


def _get_service(request: Request, db: AsyncIOMotorDatabase = Depends(get_db)) -> MessageService:
    return MessageService(
        db,
        producer=request.app.state.kafka_producer,
        settings=request.app.state.settings,
        cache=RecentMessagesCacheService(request.app.state.redis, request.app.state.settings),
        manager=request.app.state.connection_manager,
    )


@router.post("/groups/{group_id}/messages", response_model=MessageRead, status_code=201)
async def send_message(
    group_id: UUID,
    payload: MessageCreate,
    user_id: UUID = Depends(get_current_user_id),
    service: MessageService = Depends(_get_service),
) -> MessageRead:
    return await service.send_message(group_id, user_id, payload.content)


@router.get("/groups/{group_id}/messages", response_model=MessageListResponse)
async def get_messages(
    group_id: UUID,
    limit: int = 50,
    before_id: UUID | None = None,
    user_id: UUID = Depends(get_current_user_id),
    service: MessageService = Depends(_get_service),
) -> MessageListResponse:
    return await service.get_messages(group_id, user_id, limit=min(limit, 100), before_id=before_id)


@router.delete("/messages/{message_id}", status_code=204)
async def delete_message(
    message_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    service: MessageService = Depends(_get_service),
) -> None:
    await service.delete_message(message_id, user_id)


@router.patch("/messages/{message_id}", response_model=MessageRead)
async def edit_message(
    message_id: UUID,
    payload: MessageEdit,
    user_id: UUID = Depends(get_current_user_id),
    service: MessageService = Depends(_get_service),
) -> MessageRead:
    return await service.edit_message(message_id, user_id, payload.content)


@router.get("/groups/{group_id}/online", response_model=dict)
async def get_online_count(
    group_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    service: MessageService = Depends(_get_service),
) -> dict:
    count = await service.get_online_count(group_id, user_id)
    return {"group_id": str(group_id), "online_count": count}


@router.post("/groups/{group_id}/read", status_code=204)
async def mark_read(
    group_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    service: MessageService = Depends(_get_service),
) -> None:
    await service.mark_read(group_id, user_id)


@router.get("/groups/{group_id}/unread-count", response_model=dict)
async def get_unread_count(
    group_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    service: MessageService = Depends(_get_service),
) -> dict:
    count = await service.get_unread_count(group_id, user_id)
    return {"group_id": str(group_id), "unread_count": count}
