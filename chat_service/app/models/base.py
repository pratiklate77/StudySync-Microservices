from datetime import UTC, datetime

from pydantic import BaseModel, Field


class BaseDocument(BaseModel):
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
