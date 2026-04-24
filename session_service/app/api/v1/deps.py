from uuid import UUID
import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_access_token

logger = logging.getLogger(__name__)

http_bearer = HTTPBearer(auto_error=True)


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(http_bearer),
) -> UUID:
    """Extract and validate user_id from JWT — stateless (no DB call)."""

    token = credentials.credentials  # ✅ already extracted

    try:
        payload = decode_access_token(token)

        sub = payload.get("sub")
        if not sub:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing subject (sub)",
            )

        try:
            return UUID(sub)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid user_id format",
            )

    except HTTPException:
        raise  # rethrow

    except Exception as exc:
        logger.error(f"JWT validation failed: {exc}")

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )