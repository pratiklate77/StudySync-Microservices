from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class RatingSubmit(BaseModel):
    score: int = Field(ge=1, le=5)
    comment: str | None = Field(None, max_length=1000)


class RatingRead(BaseModel):
    id: UUID
    session_id: UUID
    tutor_id: UUID
    student_id: UUID
    score: int
    comment: str | None
    created_at: datetime
