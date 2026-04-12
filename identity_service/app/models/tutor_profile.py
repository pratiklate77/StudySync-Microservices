from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import ARRAY, Boolean, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class TutorProfile(Base):
    __tablename__ = "tutor_profiles"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    expertise: Mapped[list[str]] = mapped_column(ARRAY(String(128)), nullable=False)
    hourly_rate: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )
    rating_sum: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_reviews: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    user: Mapped["User"] = relationship("User", back_populates="tutor_profile")
