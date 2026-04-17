from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.session import SessionStatus, SessionType


class LocationIn(BaseModel):
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)


class SessionCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(None, max_length=2000)
    session_type: SessionType
    price: float = Field(default=0.0, ge=0)
    max_participants: int = Field(default=50, ge=1, le=500)
    scheduled_time: datetime
    location: LocationIn
    subject_tags: list[str] = Field(default_factory=list, max_length=20)


class SessionUpdate(BaseModel):
    title: str | None = Field(None, min_length=3, max_length=200)
    description: str | None = Field(None, max_length=2000)
    max_participants: int | None = Field(None, ge=1, le=500)
    scheduled_time: datetime | None = None
    subject_tags: list[str] | None = Field(None, max_length=20)
    price: float | None = Field(None, ge=0)


class SessionStatusUpdate(BaseModel):
    status: SessionStatus


class SessionRead(BaseModel):
    id: UUID
    host_id: UUID
    title: str
    description: str | None
    session_type: SessionType
    price: float
    max_participants: int
    participant_count: int
    status: SessionStatus
    scheduled_time: datetime
    longitude: float
    latitude: float
    subject_tags: list[str]
    created_at: datetime


class NearbySearchParams(BaseModel):
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)
    radius_km: float = Field(default=10.0, gt=0, le=100)
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
    session_type: SessionType | None = None
    min_price: float | None = Field(None, ge=0)
    max_price: float | None = Field(None, ge=0)
    subject_tags: list[str] | None = None
