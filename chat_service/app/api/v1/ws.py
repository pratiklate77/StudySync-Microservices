from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from fastapi import APIRouter, Query, Request, WebSocket, WebSocketDisconnect, status

from app.core.database import get_database
from app.core.security import decode_token
from app.repositories.membership_repository import MembershipRepository
from app.services.recent_messages_cache import RecentMessagesCacheService

router = APIRouter()
logger = logging.getLogger(__name__)

_HEARTBEAT_INTERVAL = 20  # seconds


@router.websocket("/groups/{group_id}/ws")
async def chat_websocket(
    group_id: UUID,
    websocket: WebSocket,
    request: Request,
    token: str = Query(...),
) -> None:
    # 1. Validate JWT
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise ValueError("not an access token")
        user_id = UUID(str(payload["sub"]))
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # 2. Check membership
    db = get_database()
    repo = MembershipRepository(db)
    membership = await repo.get(group_id, user_id)
    if membership is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    if not membership.chat_enabled:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # 3. Accept connection
    await websocket.accept()
    manager = request.app.state.connection_manager
    cache = RecentMessagesCacheService(request.app.state.redis, request.app.state.settings)

    manager.connect(group_id, user_id, websocket)
    await cache.mark_online(group_id, user_id)
    logger.info("WS accepted group=%s user=%s", group_id, user_id)

    # 4. Heartbeat task — keeps online presence TTL alive in Redis
    async def heartbeat() -> None:
        while True:
            await asyncio.sleep(_HEARTBEAT_INTERVAL)
            try:
                await cache.mark_online(group_id, user_id)
                await websocket.send_text('{"event":"ping"}')
            except Exception:
                break

    heartbeat_task = asyncio.create_task(heartbeat())

    try:
        async for raw in websocket.iter_text():
            # Incoming messages from WS are handled via REST POST /messages
            # WS is receive-only for client pong acknowledgements
            if raw == '{"event":"pong"}':
                continue
    except WebSocketDisconnect:
        pass
    finally:
        heartbeat_task.cancel()
        manager.disconnect(group_id, user_id)
        await cache.mark_offline(group_id, user_id)
        logger.info("WS disconnected group=%s user=%s", group_id, user_id)
