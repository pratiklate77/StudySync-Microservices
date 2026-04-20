from datetime import UTC, datetime
from uuid import UUID

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.verified_tutor import VerifiedTutor


class VerifiedTutorRepository:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db["verified_tutors"]

    async def upsert(self, tutor_id: UUID) -> None:
        """Idempotent upsert — safe to call multiple times for the same tutor_id."""
        await self._col.update_one(
            {"tutor_id": str(tutor_id)},
            {
                "$set": {
                    "tutor_id": str(tutor_id),
                    "is_verified": True,
                    "updated_at": datetime.now(UTC),
                },
                "$setOnInsert": {"created_at": datetime.now(UTC)},
            },
            upsert=True,
        )

    async def is_verified(self, tutor_id: UUID) -> bool:
        doc = await self._col.find_one(
            {"tutor_id": str(tutor_id), "is_verified": True},
            projection={"_id": 1},
        )
        return doc is not None
