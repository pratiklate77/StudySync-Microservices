from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.models.group_member import MemberRole


class MemberRead(BaseModel):
    id: UUID
    group_id: UUID
    user_id: UUID
    role: MemberRole
    joined_at: datetime

    model_config = {"from_attributes": True}


class KickRequest(BaseModel):
    user_id: UUID


class PromoteDemoteRequest(BaseModel):
    user_id: UUID


# Internal API response schemas (used by Chat Service and other internal consumers)
class MembershipCheck(BaseModel):
    is_member: bool
    role: MemberRole | None = None


class PermissionsCheck(BaseModel):
    can_send_message: bool
    role: MemberRole | None = None
