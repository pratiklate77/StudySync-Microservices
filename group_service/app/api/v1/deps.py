from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_access_token

http_bearer = HTTPBearer(auto_error=True)


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(http_bearer),
) -> UUID:
    """Extract and validate user_id from JWT — no DB call, stateless."""
    try:
        payload = decode_access_token(credentials.credentials)
        sub = payload.get("sub")
        if not sub:
            raise ValueError("missing subject")
        return UUID(str(sub))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        ) from exc


def get_kafka_producer(request: Request):
    producer = getattr(request.app.state, "kafka_producer", None)
    if producer is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kafka producer is not available",
        )
    return producer


def get_http_client(request: Request):
    client = getattr(request.app.state, "http_client", None)
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="HTTP client is not available",
        )
    return client
