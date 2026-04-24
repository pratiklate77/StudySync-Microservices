from __future__ import annotations
from datetime import UTC, datetime
from uuid import UUID

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.message import Message


class MessageRepository:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db["messages"]

    async def create(self, message: Message) -> Message:
        doc = message.model_dump(mode="python")
        doc["_id"] = str(message.id)
        doc["group_id"] = str(message.group_id)
        doc["sender_id"] = str(message.sender_id)
        await self._col.insert_one(doc)
        return message

    async def get_by_id(self, message_id: UUID) -> Message | None:
        doc = await self._col.find_one({"_id": str(message_id)})
        return self._to_model(doc) if doc else None

    async def list_by_group(
        self,
        group_id: UUID,
        limit: int = 50,
        before_id: UUID | None = None,
    ) -> list[Message]:
        """Cursor-based pagination — returns messages older than before_id."""
        query: dict = {"group_id": str(group_id), "is_deleted": False}
        if before_id is not None:
            ref = await self._col.find_one({"_id": str(before_id)})
            if ref:
                query["created_at"] = {"$lt": ref["created_at"]}
        cursor = self._col.find(query).sort("created_at", -1).limit(limit)
        docs = [doc async for doc in cursor]
        return [self._to_model(d) for d in docs]

    async def update_content(self, message_id: UUID, sender_id: UUID, content: str) -> Message | None:
        result = await self._col.find_one_and_update(
            {"_id": str(message_id), "sender_id": str(sender_id), "is_deleted": False},
            {"$set": {"content": content, "is_edited": True, "updated_at": datetime.now(UTC)}},
            return_document=True,
        )
        return self._to_model(result) if result else None

    async def count_after(self, group_id: UUID, after_dt: datetime) -> int:
        return await self._col.count_documents(
            {"group_id": str(group_id), "is_deleted": False, "created_at": {"$gt": after_dt}}
        )

    async def soft_delete(self, message_id: UUID) -> bool:
        result = await self._col.update_one(
            {"_id": str(message_id)},
            {"$set": {"is_deleted": True, "updated_at": datetime.now(UTC)}},
        )
        return result.modified_count > 0

    @staticmethod
    def _to_model(doc: dict) -> Message:
        doc["id"] = doc.pop("_id")
        doc["group_id"] = UUID(doc["group_id"])
        doc["sender_id"] = UUID(doc["sender_id"])
        return Message.model_validate(doc)
