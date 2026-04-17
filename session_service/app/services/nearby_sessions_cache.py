import json
import logging
from typing import TYPE_CHECKING, Any

from app.core.config import Settings

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

_CACHE_KEY_PREFIX = "session:nearby:"


class NearbySessionsCacheService:
    """Redis cache for nearby session query results.

    Key pattern: session:nearby:{lon}:{lat}:{radius_km}
    TTL is short (default 60s) because session availability changes frequently.

    Mirrors TopTutorsCacheService from identity service.
    """

    def __init__(self, redis: "Redis | None", settings: Settings) -> None:
        self._redis = redis
        self._settings = settings

    def _key(self, longitude: float, latitude: float, radius_km: float) -> str:
        # Round to 2dp to bucket nearby coordinates into the same cache entry
        return f"{_CACHE_KEY_PREFIX}{round(longitude, 2)}:{round(latitude, 2)}:{radius_km}"

    async def get(self, longitude: float, latitude: float, radius_km: float) -> str | None:
        if self._redis is None:
            return None
        try:
            return await self._redis.get(self._key(longitude, latitude, radius_km))
        except Exception:
            logger.exception("Redis GET failed for nearby sessions cache")
            return None

    async def set(self, longitude: float, latitude: float, radius_km: float, payload: str) -> None:
        if self._redis is None:
            return
        try:
            await self._redis.setex(
                self._key(longitude, latitude, radius_km),
                self._settings.nearby_sessions_cache_ttl_seconds,
                payload,
            )
        except Exception:
            logger.exception("Redis SET failed for nearby sessions cache")

    @staticmethod
    def serialize(entries: list[dict[str, Any]]) -> str:
        return json.dumps(entries, default=str)

    @staticmethod
    def deserialize(raw: str) -> list[dict[str, Any]]:
        return json.loads(raw)
