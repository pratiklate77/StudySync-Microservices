from uuid import UUID, uuid4

from pydantic import Field

from app.models.base import BaseDocument


class Message(BaseDocument):
    """Maps to the 'messages' MongoDB collection."""

    id: UUID = Field(default_factory=uuid4)
    group_id: UUID
    sender_id: UUID
    content: str
    is_deleted: bool = False
    is_edited: bool = False
