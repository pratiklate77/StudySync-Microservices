from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any
from uuid import UUID

from app.core.config import Settings

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

_RECENT_KEY_PREFIX = "chat:recent:"
_ONLINE_KEY_PREFIX = "chat:online:"
_ONLINE_TTL = 30  # seconds — refreshed on each WS heartbeat


class RecentMessagesCacheService:
    """Caches last N messages per group.

    Key: chat:recent:{group_id}  → JSON list
    TTL: 10 minutes (configurable)
    Invalidated on every new message or delete.
    """

    def __init__(self, redis: "Redis | None", settings: Settings) -> None:
        self._redis = redis
        self._settings = settings

    def _key(self, group_id: UUID) -> str:
        return f"{_RECENT_KEY_PREFIX}{group_id}"

    async def get(self, group_id: UUID) -> list[dict[str, Any]] | None:
        if self._redis is None:
            return None
        try:
            raw = await self._redis.get(self._key(group_id))
            return json.loads(raw) if raw else None
        except Exception:
            logger.exception("Redis GET failed for recent messages group=%s", group_id)
            return None

    async def set(self, group_id: UUID, messages: list[dict[str, Any]]) -> None:
        if self._redis is None:
            return
        try:
            await self._redis.setex(
                self._key(group_id),
                self._settings.recent_messages_cache_ttl_seconds,
                json.dumps(messages, default=str),
            )
        except Exception:
            logger.exception("Redis SET failed for recent messages group=%s", group_id)

    async def invalidate(self, group_id: UUID) -> None:
        if self._redis is None:
            return
        try:
            await self._redis.delete(self._key(group_id))
        except Exception:
            logger.exception("Redis DEL failed for recent messages group=%s", group_id)

    # --- Online presence ---

    async def mark_online(self, group_id: UUID, user_id: UUID) -> None:
        if self._redis is None:
            return
        try:
            await self._redis.setex(f"{_ONLINE_KEY_PREFIX}{group_id}:{user_id}", _ONLINE_TTL, "1")
        except Exception:
            logger.exception("Redis SET failed for online presence")

    async def mark_offline(self, group_id: UUID, user_id: UUID) -> None:
        if self._redis is None:
            return
        try:
            await self._redis.delete(f"{_ONLINE_KEY_PREFIX}{group_id}:{user_id}")
        except Exception:
            logger.exception("Redis DEL failed for online presence")

    async def online_count(self, group_id: UUID) -> int:
        if self._redis is None:
            return 0
        try:
            keys = await self._redis.keys(f"{_ONLINE_KEY_PREFIX}{group_id}:*")
            return len(keys)
        except Exception:
            logger.exception("Redis KEYS failed for online count")
            return 0

    # --- Read receipts ---
    # Key: chat:read:{group_id}:{user_id}  →  ISO datetime string of last read message

    async def set_read_cursor(self, group_id: UUID, user_id: UUID, iso_dt: str) -> None:
        if self._redis is None:
            return
        try:
            await self._redis.set(f"chat:read:{group_id}:{user_id}", iso_dt)
        except Exception:
            logger.exception("Redis SET failed for read cursor")

    async def get_read_cursor(self, group_id: UUID, user_id: UUID) -> str | None:
        if self._redis is None:
            return None
        try:
            return await self._redis.get(f"chat:read:{group_id}:{user_id}")
        except Exception:
            logger.exception("Redis GET failed for read cursor")
            return None
