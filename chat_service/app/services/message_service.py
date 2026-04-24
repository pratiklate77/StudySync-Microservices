from __future__ import annotations

import logging
from uuid import UUID

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import Settings
from app.events.kafka_producer import publish_message_deleted, publish_message_sent
from app.kafka.producer import ResilientKafkaProducer
from app.models.message import Message
from app.repositories.membership_repository import MembershipRepository
from app.repositories.message_repository import MessageRepository
from app.schemas.message import MessageListResponse, MessageRead
from app.services.connection_manager import ConnectionManager
from app.services.recent_messages_cache import RecentMessagesCacheService

logger = logging.getLogger(__name__)


class MessageService:
    def __init__(
        self,
        db: AsyncIOMotorDatabase,
        *,
        producer: ResilientKafkaProducer,
        settings: Settings,
        cache: RecentMessagesCacheService,
        manager: ConnectionManager,
    ) -> None:
        self._messages = MessageRepository(db)
        self._memberships = MembershipRepository(db)
        self._producer = producer
        self._settings = settings
        self._cache = cache
        self._manager = manager

    async def send_message(self, group_id: UUID, sender_id: UUID, content: str) -> MessageRead:
        membership = await self._memberships.get(group_id, sender_id)
        if membership is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group")
        if not membership.chat_enabled:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chat is disabled for this group")

        message = Message(group_id=group_id, sender_id=sender_id, content=content)
        await self._messages.create(message)

        # Invalidate cache — next fetch will pull fresh from DB
        await self._cache.invalidate(group_id)

        # Broadcast to all connected WebSocket clients
        await self._manager.broadcast(group_id, {
            "event": "message",
            "id": str(message.id),
            "group_id": str(group_id),
            "sender_id": str(sender_id),
            "content": content,
            "created_at": message.created_at.isoformat(),
        })

        # Publish to Kafka — fire and forget (resilient producer handles failures)
        await publish_message_sent(
            self._producer,
            self._settings,
            group_id=group_id,
            sender_id=sender_id,
            message_id=message.id,
            preview=content,
        )

        return MessageRead(
            id=message.id,
            group_id=message.group_id,
            sender_id=message.sender_id,
            content=message.content,
            is_deleted=message.is_deleted,
            created_at=message.created_at,
        )

    async def get_messages(
        self,
        group_id: UUID,
        requester_id: UUID,
        limit: int = 50,
        before_id: UUID | None = None,
    ) -> MessageListResponse:
        if not await self._memberships.is_member(group_id, requester_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group")

        # Only use cache for first page (no cursor)
        if before_id is None:
            cached = await self._cache.get(group_id)
            if cached is not None:
                messages = [MessageRead(**m) for m in cached]
                return MessageListResponse(messages=messages, has_more=len(messages) == limit)

        messages = await self._messages.list_by_group(group_id, limit=limit + 1, before_id=before_id)
        has_more = len(messages) > limit
        messages = messages[:limit]

        result = [
            MessageRead(
                id=m.id,
                group_id=m.group_id,
                sender_id=m.sender_id,
                content=m.content,
                is_deleted=m.is_deleted,
                created_at=m.created_at,
            )
            for m in messages
        ]

        # Cache first page
        if before_id is None:
            await self._cache.set(group_id, [r.model_dump() for r in result])

        return MessageListResponse(messages=result, has_more=has_more)

    async def edit_message(self, message_id: UUID, requester_id: UUID, content: str) -> MessageRead:
        message = await self._messages.get_by_id(message_id)
        if message is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
        if message.sender_id != requester_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only edit your own messages")
        if message.is_deleted:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot edit a deleted message")

        updated = await self._messages.update_content(message_id, requester_id, content)
        if updated is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

        await self._cache.invalidate(message.group_id)
        await self._manager.broadcast(message.group_id, {
            "event": "message_edited",
            "message_id": str(message_id),
            "group_id": str(message.group_id),
            "content": content,
        })
        return MessageRead(
            id=updated.id,
            group_id=updated.group_id,
            sender_id=updated.sender_id,
            content=updated.content,
            is_deleted=updated.is_deleted,
            is_edited=updated.is_edited,
            created_at=updated.created_at,
        )

    async def get_online_count(self, group_id: UUID, requester_id: UUID) -> int:
        if not await self._memberships.is_member(group_id, requester_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group")
        return await self._cache.online_count(group_id)

    async def mark_read(self, group_id: UUID, user_id: UUID) -> None:
        if not await self._memberships.is_member(group_id, user_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group")
        from datetime import UTC, datetime
        await self._cache.set_read_cursor(group_id, user_id, datetime.now(UTC).isoformat())

    async def get_unread_count(self, group_id: UUID, user_id: UUID) -> int:
        if not await self._memberships.is_member(group_id, user_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group")
        cursor_str = await self._cache.get_read_cursor(group_id, user_id)
        if cursor_str is None:
            return 0
        from datetime import UTC, datetime
        after_dt = datetime.fromisoformat(cursor_str)
        return await self._messages.count_after(group_id, after_dt)

    async def delete_message(self, message_id: UUID, requester_id: UUID) -> None:
        message = await self._messages.get_by_id(message_id)
        if message is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

        membership = await self._memberships.get(message.group_id, requester_id)
        is_sender = message.sender_id == requester_id
        is_admin = membership is not None and membership.role == "admin"

        if not is_sender and not is_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete this message")

        await self._messages.soft_delete(message_id)
        await self._cache.invalidate(message.group_id)

        await self._manager.broadcast(message.group_id, {
            "event": "message_deleted",
            "message_id": str(message_id),
            "group_id": str(message.group_id),
        })

        await publish_message_deleted(
            self._producer,
            self._settings,
            group_id=message.group_id,
            message_id=message_id,
            deleted_by=requester_id,
        )
