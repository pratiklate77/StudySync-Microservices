import enum
from datetime import datetime
from uuid import UUID, uuid4

from pydantic import Field

from app.models.base import BaseDocument


class SessionType(str, enum.Enum):
    free = "free"
    paid = "paid"


class SessionStatus(str, enum.Enum):
    scheduled = "scheduled"
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class GeoPoint(BaseDocument):
    """GeoJSON Point — required shape for MongoDB 2dsphere index."""

    type: str = "Point"
    coordinates: list[float]  # [longitude, latitude]  ← MongoDB GeoJSON order


class Session(BaseDocument):
    """Maps to the 'sessions' MongoDB collection."""

    id: UUID = Field(default_factory=uuid4)
    host_id: UUID                          # tutor's user_id from Identity Service
    title: str
    description: str | None = None
    session_type: SessionType
    price: float = 0.0                     # 0.0 for free sessions
    max_participants: int = 50
    participants: list[UUID] = Field(default_factory=list)
    status: SessionStatus = SessionStatus.scheduled
    scheduled_time: datetime
    location: GeoPoint                     # 2dsphere-indexed field
    subject_tags: list[str] = Field(default_factory=list)
