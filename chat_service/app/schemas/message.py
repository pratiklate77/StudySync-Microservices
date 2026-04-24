from __future__ import annotations
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class MessageEdit(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class MessageRead(BaseModel):
    id: UUID
    group_id: UUID
    sender_id: UUID
    content: str
    is_deleted: bool
    is_edited: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageListResponse(BaseModel):
    messages: list[MessageRead]
    has_more: bool
