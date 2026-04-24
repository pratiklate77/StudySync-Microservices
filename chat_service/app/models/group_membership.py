from uuid import UUID, uuid4

from pydantic import Field

from app.models.base import BaseDocument


class GroupMembership(BaseDocument):
    """Local mirror of group_service membership — kept in sync via Kafka GROUP_EVENTS.

    Stored in 'group_memberships' collection.
    Unique index on (group_id, user_id).
    """

    id: UUID = Field(default_factory=uuid4)
    group_id: UUID
    user_id: UUID
    role: str = "member"          # admin | member
    chat_enabled: bool = True     # mirrors group.chat_enabled
    is_active: bool = True        # False when user leaves or group is deleted
