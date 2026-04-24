from __future__ import annotations

import logging
from uuid import UUID

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """In-memory WebSocket connection registry per group.

    { group_id: { user_id: WebSocket } }

    Single-instance only. For multi-instance deployments,
    replace broadcast with Redis Pub/Sub.
    """

    def __init__(self) -> None:
        self._connections: dict[UUID, dict[UUID, WebSocket]] = {}

    def connect(self, group_id: UUID, user_id: UUID, ws: WebSocket) -> None:
        if group_id not in self._connections:
            self._connections[group_id] = {}
        self._connections[group_id][user_id] = ws
        logger.info("WS connected group=%s user=%s total=%d", group_id, user_id, len(self._connections[group_id]))

    def disconnect(self, group_id: UUID, user_id: UUID) -> None:
        group_conns = self._connections.get(group_id, {})
        group_conns.pop(user_id, None)
        if not group_conns:
            self._connections.pop(group_id, None)
        logger.info("WS disconnected group=%s user=%s", group_id, user_id)

    async def broadcast(self, group_id: UUID, message: dict) -> None:
        """Send message to all connected clients in a group."""
        import json
        group_conns = self._connections.get(group_id, {})
        dead: list[UUID] = []
        for user_id, ws in group_conns.items():
            try:
                await ws.send_text(json.dumps(message, default=str))
            except Exception:
                dead.append(user_id)
        for user_id in dead:
            self.disconnect(group_id, user_id)

    def online_users(self, group_id: UUID) -> list[UUID]:
        return list(self._connections.get(group_id, {}).keys())
