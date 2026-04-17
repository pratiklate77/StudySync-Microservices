from uuid import UUID

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.models.rating import Rating


class RatingRepository:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db["ratings"]

    async def create(self, rating: Rating) -> Rating:
        doc = rating.model_dump(mode="python")
        doc["_id"] = str(rating.id)
        doc["session_id"] = str(rating.session_id)
        doc["tutor_id"] = str(rating.tutor_id)
        doc["student_id"] = str(rating.student_id)
        try:
            await self._col.insert_one(doc)
        except DuplicateKeyError:
            return None  # type: ignore[return-value]
        return rating

    async def exists(self, session_id: UUID, student_id: UUID) -> bool:
        doc = await self._col.find_one(
            {"session_id": str(session_id), "student_id": str(student_id)},
            projection={"_id": 1},
        )
        return doc is not None

    async def list_by_session(self, session_id: UUID, limit: int = 50, offset: int = 0) -> list[Rating]:
        cursor = (
            self._col.find({"session_id": str(session_id)})
            .sort("created_at", -1)
            .skip(offset)
            .limit(limit)
        )
        results = []
        async for doc in cursor:
            doc["id"] = doc.pop("_id")
            results.append(Rating.model_validate(doc))
        return results
