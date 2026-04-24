from __future__ import annotations
from datetime import UTC, datetime
from uuid import UUID

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.group_membership import GroupMembership


class MembershipRepository:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db["group_memberships"]

    async def upsert(self, group_id: UUID, user_id: UUID, role: str = "member", chat_enabled: bool = True) -> None:
        now = datetime.now(UTC)
        await self._col.update_one(
            {"group_id": str(group_id), "user_id": str(user_id)},
            {
                "$set": {
                    "role": role,
                    "chat_enabled": chat_enabled,
                    "is_active": True,
                    "updated_at": now,
                },
                "$setOnInsert": {"_id": str(__import__("uuid").uuid4()), "created_at": now},
            },
            upsert=True,
        )

    async def deactivate(self, group_id: UUID, user_id: UUID) -> None:
        await self._col.update_one(
            {"group_id": str(group_id), "user_id": str(user_id)},
            {"$set": {"is_active": False, "updated_at": datetime.now(UTC)}},
        )

    async def deactivate_group(self, group_id: UUID) -> None:
        """Called when group is deleted — deactivates all memberships."""
        await self._col.update_many(
            {"group_id": str(group_id)},
            {"$set": {"is_active": False, "updated_at": datetime.now(UTC)}},
        )

    async def set_chat_enabled(self, group_id: UUID, enabled: bool) -> None:
        await self._col.update_many(
            {"group_id": str(group_id)},
            {"$set": {"chat_enabled": enabled, "updated_at": datetime.now(UTC)}},
        )

    async def get(self, group_id: UUID, user_id: UUID) -> GroupMembership | None:
        doc = await self._col.find_one(
            {"group_id": str(group_id), "user_id": str(user_id), "is_active": True}
        )
        return self._to_model(doc) if doc else None

    async def is_member(self, group_id: UUID, user_id: UUID) -> bool:
        doc = await self._col.find_one(
            {"group_id": str(group_id), "user_id": str(user_id), "is_active": True},
            projection={"_id": 1},
        )
        return doc is not None

    @staticmethod
    def _to_model(doc: dict) -> GroupMembership:
        doc["id"] = doc.pop("_id")
        doc["group_id"] = UUID(doc["group_id"])
        doc["user_id"] = UUID(doc["user_id"])
        return GroupMembership.model_validate(doc)
