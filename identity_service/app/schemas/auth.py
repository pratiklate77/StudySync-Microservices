from __future__ import annotations
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserRead(BaseModel):
    id: UUID
    email: EmailStr
    role: str
    is_active: bool
    last_known_latitude: float | None = None
    last_known_longitude: float | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserProfileUpdate(BaseModel):
    last_known_latitude: float | None = Field(None, ge=-90, le=90)
    last_known_longitude: float | None = Field(None, ge=-180, le=180)


class UserProfileRead(BaseModel):
    """Extended user profile with tutor information if applicable."""
    id: UUID
    email: EmailStr
    role: str
    is_active: bool
    last_known_latitude: float | None = None
    last_known_longitude: float | None = None
    created_at: datetime
    tutor_profile: "TutorProfileBasic | None" = None

    model_config = {"from_attributes": True}


class TutorProfileBasic(BaseModel):
    """Basic tutor info embedded in user profile."""
    id: UUID
    bio: str | None
    expertise: list[str]
    hourly_rate: float
    is_verified: bool
    rating_sum: int
    total_reviews: int

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str
