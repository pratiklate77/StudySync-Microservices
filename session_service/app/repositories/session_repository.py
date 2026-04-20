from datetime import UTC, datetime
from uuid import UUID

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.session import GeoPoint, Session, SessionStatus, SessionType

# Valid state machine transitions
_ALLOWED_TRANSITIONS: dict[SessionStatus, set[SessionStatus]] = {
    SessionStatus.scheduled: {SessionStatus.active, SessionStatus.cancelled},
    SessionStatus.active: {SessionStatus.completed},
    SessionStatus.completed: set(),
    SessionStatus.cancelled: set(),
}


class SessionRepository:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db["sessions"]

    async def create(self, session: Session) -> Session:
        doc = session.model_dump(mode="python")
        doc["_id"] = str(session.id)
        doc["location"] = {
            "type": "Point",
            "coordinates": session.location.coordinates,
        }
        await self._col.insert_one(doc)
        return session

    async def get_by_id(self, session_id: UUID) -> Session | None:
        doc = await self._col.find_one({"_id": str(session_id)})
        return self._to_model(doc) if doc else None

    async def update(self, session_id: UUID, fields: dict) -> Session | None:
        """Partial update — only sets provided fields."""
        fields["updated_at"] = datetime.now(UTC)
        result = await self._col.find_one_and_update(
            {"_id": str(session_id)},
            {"$set": fields},
            return_document=True,
        )
        return self._to_model(result) if result else None

    async def set_status(self, session_id: UUID, new_status: SessionStatus) -> Session | None:
        result = await self._col.find_one_and_update(
            {"_id": str(session_id)},
            {"$set": {"status": new_status.value, "updated_at": datetime.now(UTC)}},
            return_document=True,
        )
        return self._to_model(result) if result else None

    async def remove_participant(self, session_id: UUID, user_id: UUID) -> bool:
        """Atomically remove a participant. Returns True if modified."""
        result = await self._col.update_one(
            {"_id": str(session_id)},
            {
                "$pull": {"participants": str(user_id)},
                "$set": {"updated_at": datetime.now(UTC)},
            },
        )
        return result.modified_count > 0

    async def add_participant(self, session_id: UUID, user_id: UUID) -> bool:
        """Atomically add participant. Returns True if document was modified."""
        result = await self._col.update_one(
            {
                "_id": str(session_id),
                "participants": {"$ne": str(user_id)},
                "$expr": {"$lt": [{"$size": "$participants"}, "$max_participants"]},
            },
            {
                "$addToSet": {"participants": str(user_id)},
                "$set": {"updated_at": datetime.now(UTC)},
            },
        )
        return result.modified_count > 0

    async def find_nearby(
        self,
        longitude: float,
        latitude: float,
        radius_meters: float,
        limit: int,
        offset: int = 0,
        session_type: SessionType | None = None,
        min_price: float | None = None,
        max_price: float | None = None,
        subject_tags: list[str] | None = None,
    ) -> list[Session]:
        query: dict = {
            "location": {
                "$nearSphere": {
                    "$geometry": {"type": "Point", "coordinates": [longitude, latitude]},
                    "$maxDistance": radius_meters,
                }
            },
            "status": SessionStatus.scheduled.value,
        }
        if session_type is not None:
            query["session_type"] = session_type.value
        if min_price is not None or max_price is not None:
            price_filter: dict = {}
            if min_price is not None:
                price_filter["$gte"] = min_price
            if max_price is not None:
                price_filter["$lte"] = max_price
            query["price"] = price_filter
        if subject_tags:
            query["subject_tags"] = {"$in": subject_tags}

        cursor = self._col.find(query).skip(offset).limit(limit)
        return [self._to_model(doc) async for doc in cursor if doc]

    async def list_by_host(self, host_id: UUID, limit: int = 50) -> list[Session]:
        cursor = self._col.find({"host_id": str(host_id)}).sort("scheduled_time", -1).limit(limit)
        return [self._to_model(doc) async for doc in cursor if doc]

    async def get_participants(self, session_id: UUID) -> list[UUID] | None:
        doc = await self._col.find_one(
            {"_id": str(session_id)},
            projection={"participants": 1},
        )
        if doc is None:
            return None
        return [UUID(p) for p in doc.get("participants", [])]

    @staticmethod
    def is_valid_transition(current: SessionStatus, new: SessionStatus) -> bool:
        return new in _ALLOWED_TRANSITIONS.get(current, set())

    @staticmethod
    def _to_model(doc: dict) -> Session:
        doc["id"] = doc.pop("_id")
        coords = doc["location"]["coordinates"]
        doc["location"] = GeoPoint(coordinates=coords)
        doc["participants"] = [UUID(p) for p in doc.get("participants", [])]
        return Session.model_validate(doc)
