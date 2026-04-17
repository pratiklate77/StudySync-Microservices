from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class GroupCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str | None = Field(None, max_length=2000)
    is_private: bool = False
    max_members: int = Field(default=50, ge=2, le=500)
    chat_enabled: bool = True


class GroupUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=200)
    description: str | None = Field(None, max_length=2000)
    is_private: bool | None = None
    max_members: int | None = Field(None, ge=2, le=500)
    chat_enabled: bool | None = None


class GroupRead(BaseModel):
    id: UUID
    name: str
    description: str | None
    owner_id: UUID
    is_private: bool
    max_members: int
    is_active: bool
    chat_enabled: bool
    member_count: int
    created_at: datetime

    model_config = {"from_attributes": True}
