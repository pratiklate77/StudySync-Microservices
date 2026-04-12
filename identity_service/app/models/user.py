import enum
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, Enum, Float, String, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.tutor_profile import TutorProfile


class UserRole(str, enum.Enum):
    user = "user"
    tutor = "tutor"


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", native_enum=False),
        nullable=False,
        default=UserRole.user,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_known_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_known_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tutor_profile: Mapped["TutorProfile | None"] = relationship(
        "TutorProfile",
        back_populates="user",
        uselist=False,
    )
