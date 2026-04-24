from uuid import UUID

import logging
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_token

logger = logging.getLogger(__name__)

http_bearer = HTTPBearer(auto_error=True)


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(http_bearer),
) -> UUID:
    """Stateless JWT validation — no DB call, just signature check."""
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise ValueError("not an access token")
        sub = payload.get("sub")
        if not sub:
            raise ValueError("missing sub")
        return UUID(str(sub))
    except Exception as exc:
        logger.warning("JWT validation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
