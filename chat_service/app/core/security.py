from __future__ import annotations
from typing import Any

import jwt

from app.core.config import get_settings


def decode_token(token: str) -> dict[str, Any]:
    """Decode and verify a JWT issued by Identity Service.
    Chat service never issues tokens — only validates them.
    """
    settings = get_settings()
    return jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
    )
