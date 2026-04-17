from uuid import UUID, uuid4

from pydantic import Field

from app.models.base import BaseDocument


class VerifiedTutor(BaseDocument):
    """Local read-model populated by consuming TUTOR_VERIFIED Kafka events.

    This collection is the session service's source of truth for whether a
    tutor may create paid sessions. It is NOT a copy of the identity service
    tutor_profiles table — it only stores the verification flag.
    """

    id: UUID = Field(default_factory=uuid4)
    tutor_id: UUID          # user_id from Identity Service
    is_verified: bool = True
