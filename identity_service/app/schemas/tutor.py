from __future__ import annotations
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


class TutorProfileUpdate(BaseModel):
    """Update tutor-specific profile fields."""
    bio: str | None = Field(None, max_length=2000)
    expertise: list[str] | None = Field(None, max_length=50)
    hourly_rate: Decimal | None = Field(None, ge=Decimal("0"))


class TutorSearchParams(BaseModel):
    """Query parameters for searching tutors."""
    expertise: list[str] | None = Field(None, description="Filter by expertise tags")
    min_rating: float | None = Field(None, ge=0, le=5, description="Minimum average rating")
    verified_only: bool = Field(False, description="Only show verified tutors")
    limit: int = Field(20, ge=1, le=100)
    offset: int = Field(0, ge=0)


class TutorStatsRead(BaseModel):
    """Tutor statistics and rating info."""
    id: UUID
    user_id: UUID
    bio: str | None
    expertise: list[str]
    hourly_rate: Decimal
    is_verified: bool
    average_rating: float
    total_reviews: int
    rating_sum: int

    model_config = {"from_attributes": True}
