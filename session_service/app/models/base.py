from datetime import UTC, datetime

from pydantic import BaseModel, Field


class BaseDocument(BaseModel):
    """Base for all MongoDB document models.

    Mirrors identity service models/base.py but for Motor (dict-based documents).
    created_at / updated_at are set by the repository layer, not the DB server,
    because MongoDB has no server-side default equivalent to PostgreSQL's func.now().
    """

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
