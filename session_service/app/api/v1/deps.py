from uuid import UUID
import logging

from fastapi import Depends, Request, HTTPException, status
from app.core.config import get_settings
from app.core.security import decode_access_token

logger = logging.getLogger(__name__)


def get_current_user_id(
    request: Request,
    settings = Depends(get_settings)
) -> UUID:
    """Extract user ID from auth source based on configuration.
    
    Dev modes (AUTH_ENABLED=false):
    1. If TEST_USER_ID is set → use it (reproducible testing)
    2. Otherwise try x-user-id header (manual user injection)
    3. Otherwise generate random UUID
    
    Prod mode (AUTH_ENABLED=true):
    - Validates JWT token from Authorization header
    """
    # ✅ DEV MODE: Bypass authentication
    if not settings.AUTH_ENABLED:
        if settings.TEST_USER_ID:
            user_id = UUID(str(settings.TEST_USER_ID))
            logger.debug(f"Using injected TEST_USER_ID: {user_id}")
            return user_id
        
        # Fallback: try header-provided user ID
        header_user_id = request.headers.get("x-user-id")
        if header_user_id:
            try:
                user_id = UUID(str(header_user_id))
                logger.debug(f"Using x-user-id header: {user_id}")
                return user_id
            except ValueError:
                logger.warning(f"Invalid x-user-id format: {header_user_id}, using random UUID")
        
        # Last resort: generate random UUID
        from uuid import uuid4
        user_id = uuid4()
        logger.debug(f"Generated random user ID: {user_id}")
        return user_id

    # ✅ PROD MODE: Real JWT validation
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing"
        )

    try:
        token = auth_header.split(" ")[1]
        payload = decode_access_token(token)
        sub = payload.get("sub")
        if not sub:
            raise ValueError("missing subject")
        return UUID(str(sub))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        ) from exc