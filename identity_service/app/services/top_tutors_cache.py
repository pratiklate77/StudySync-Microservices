from __future__ import annotations
import json
import logging
from typing import TYPE_CHECKING, Any

from app.core.config import Settings

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)


class TopTutorsCacheService:
    def __init__(self, redis: "Redis | None", settings: Settings) -> None:
        self._redis = redis
        self._settings = settings

    async def get_cached_payload(self) -> str | None:
        if self._redis is None:
            return None
        try:
            return await self._redis.get(self._settings.top_tutors_cache_key)
        except Exception:
            logger.exception("Redis GET failed for top tutors cache")
            return None

    async def set_cached_payload(self, payload: str) -> None:
        if self._redis is None:
            return
        await self._redis.setex(
            self._settings.top_tutors_cache_key,
            self._settings.top_tutors_cache_ttl_seconds,
            payload,
        )

    async def invalidate(self) -> None:
        if self._redis is None:
            return
        try:
            await self._redis.delete(self._settings.top_tutors_cache_key)
        except Exception:
            logger.exception("Redis DEL failed for top tutors cache")

    @staticmethod
    def serialize_entries(entries: list[dict[str, Any]]) -> str:
        return json.dumps(entries)

    @staticmethod
    def deserialize_entries(raw: str) -> list[dict[str, Any]]:
        return json.loads(raw)
