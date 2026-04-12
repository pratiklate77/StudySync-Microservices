import asyncio
import json
import logging
from contextlib import suppress
from typing import TYPE_CHECKING

from aiokafka import AIOKafkaConsumer
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import Settings
from app.services.top_tutors_cache import TopTutorsCacheService
from app.services.tutor_service import TutorService

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)


class RatingEventsConsumer:
    def __init__(
        self,
        settings: Settings,
        session_factory: async_sessionmaker,
        redis: "Redis | None",
    ) -> None:
        self._settings = settings
        self._session_factory = session_factory
        self._redis = redis
        self._consumer: AIOKafkaConsumer | None = None
        self._task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._consumer = AIOKafkaConsumer(
            self._settings.kafka_rating_events_topic,
            bootstrap_servers=self._settings.kafka_bootstrap_servers.split(","),
            group_id=self._settings.kafka_consumer_group,
            client_id=f"{self._settings.kafka_client_id}-rating-consumer",
            enable_auto_commit=True,
            auto_offset_reset="earliest",
            value_deserializer=lambda v: json.loads(v.decode("utf-8")),
        )
        await self._consumer.start()
        self._task = asyncio.create_task(self._run_loop(), name="identity-rating-consumer")

    async def _run_loop(self) -> None:
        cache = TopTutorsCacheService(self._redis, self._settings)
        assert self._consumer is not None
        try:
            async for msg in self._consumer:
                try:
                    data = msg.value
                    if not isinstance(data, dict):
                        continue
                    if data.get("event_type") != "RATING_SUBMITTED":
                        continue
                    tutor_user_id = data.get("tutor_id")
                    score = data.get("score")
                    if tutor_user_id is None or score is None:
                        continue
                    async with self._session_factory() as session:
                        tutor_service = TutorService(session)
                        updated = await tutor_service.apply_rating_from_event(
                            tutor_user_id=str(tutor_user_id),
                            score=int(score),
                        )
                        await session.commit()
                        if updated:
                            await cache.invalidate()
                except Exception:
                    logger.exception("Failed processing RATING_EVENTS message")
        except asyncio.CancelledError:
            logger.info("Rating events consumer task cancelled")
            raise

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        if self._consumer is not None:
            await self._consumer.stop()
            self._consumer = None
