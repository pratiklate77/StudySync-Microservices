from uuid import UUID, uuid4

from pydantic import Field

from app.models.base import BaseDocument


class Rating(BaseDocument):
    """Maps to the 'ratings' MongoDB collection.

    Composite unique index on (session_id, student_id) enforces one rating
    per student per session at the DB level.
    """

    id: UUID = Field(default_factory=uuid4)
    session_id: UUID
    tutor_id: UUID
    student_id: UUID
    score: int                  # 1–5, validated at schema layer
    comment: str | None = None
