from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_http_client
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.schemas.member import MembershipCheck, PermissionsCheck
from app.services.member_service import MemberService

router = APIRouter()


def get_member_service(db: AsyncSession = Depends(get_db)) -> MemberService:
    return MemberService(db)


@router.get("/groups/{group_id}/members/{user_id}", response_model=MembershipCheck)
async def check_membership(
    group_id: UUID,
    user_id: UUID,
    service: MemberService = Depends(get_member_service),
) -> MembershipCheck:
    """Used by Chat Service to verify a user is a member before allowing messages."""
    return await service.check_membership(group_id, user_id)


@router.get("/groups/{group_id}/permissions/{user_id}", response_model=PermissionsCheck)
async def check_permissions(
    group_id: UUID,
    user_id: UUID,
    service: MemberService = Depends(get_member_service),
) -> PermissionsCheck:
    """Used by Chat Service to check if a user can send messages in a group."""
    return await service.check_permissions(group_id, user_id)


# ── Group-Session proxy endpoints ─────────────────────────────────────────────

@router.get("/groups/{group_id}/sessions")
async def get_group_sessions(
    group_id: UUID,
    http_client: httpx.AsyncClient = Depends(get_http_client),
    settings: Settings = Depends(get_settings),
) -> list[dict]:
    """Proxy to Session Service — fetch sessions tagged with this group_id."""
    try:
        response = await http_client.get(
            f"{settings.session_service_url}/api/v1/sessions",
            params={"group_id": str(group_id)},
            timeout=settings.session_service_timeout_seconds,
        )
        response.raise_for_status()
        return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Session service timed out")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(exc.response.status_code, detail="Session service error")
    except httpx.RequestError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Session service unavailable")


@router.post("/groups/{group_id}/sessions/{session_id}", status_code=200)
async def attach_session(
    group_id: UUID,
    session_id: UUID,
    http_client: httpx.AsyncClient = Depends(get_http_client),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Proxy to Session Service — attach a session to this group."""
    try:
        response = await http_client.patch(
            f"{settings.session_service_url}/api/v1/sessions/{session_id}",
            json={"group_id": str(group_id)},
            timeout=settings.session_service_timeout_seconds,
        )
        response.raise_for_status()
        return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Session service timed out")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(exc.response.status_code, detail="Session service error")
    except httpx.RequestError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Session service unavailable")
