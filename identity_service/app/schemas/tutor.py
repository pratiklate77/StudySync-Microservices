from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class TutorBecome(BaseModel):
    bio: str | None = Field(None, max_length=2000)
    expertise: list[str] = Field(
        default_factory=list,
        max_length=50,
        description="Up to 50 subject tags",
    )
    hourly_rate: Decimal = Field(default=Decimal("0"), ge=Decimal("0"))


class TutorProfileRead(BaseModel):
    id: UUID
    user_id: UUID
    bio: str | None
    expertise: list[str]
    hourly_rate: Decimal
    rating_sum: int
    total_reviews: int
    is_verified: bool

    model_config = {"from_attributes": True}
