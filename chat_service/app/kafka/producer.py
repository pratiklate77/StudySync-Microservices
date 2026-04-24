from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from aiokafka import AIOKafkaProducer

from app.core.config import Settings
from app.kafka.circuit_breaker import CircuitBreaker
from app.kafka.fallback_store import EventEnvelope, EventStore

logger = logging.getLogger(__name__)


class ResilientKafkaProducer:
    def __init__(
        self,
        *,
        settings: Settings,
        circuit_breaker: CircuitBreaker,
        fallback_store: EventStore,
    ) -> None:
        self._settings = settings
        self._circuit_breaker = circuit_breaker
        self._fallback_store = fallback_store
        self._producer: AIOKafkaProducer | None = None
        self._producer_lock = asyncio.Lock()

    async def start(self, retries: int | None = None, delay: float | None = None) -> bool:
        max_retries = retries if retries is not None else self._settings.kafka_startup_max_retries
        retry_delay = delay if delay is not None else self._settings.kafka_startup_retry_delay_seconds
        for attempt in range(1, max_retries + 1):
            try:
                await self._ensure_producer()
                logger.info("Kafka producer connected on startup attempt %d", attempt)
                return True
            except Exception as exc:
                await self._circuit_breaker.record_failure()
                logger.warning("Kafka producer startup attempt %d/%d failed: %s", attempt, max_retries, exc)
                if attempt < max_retries:
                    await asyncio.sleep(retry_delay)
        logger.error("Kafka producer unavailable after %d startup attempts", max_retries)
        return False

    async def stop(self) -> None:
        async with self._producer_lock:
            if self._producer is not None:
                await self._producer.stop()
                self._producer = None

    async def publish(self, *, topic: str, value: dict[str, Any], key: bytes) -> bool:
        event = EventEnvelope(topic=topic, key=key, value=value)
        return await self._publish_or_store(event, store_on_failure=True)

    async def retry_event(self, event: EventEnvelope) -> bool:
        return await self._publish_or_store(event, store_on_failure=False)

    async def fallback_queue_size(self) -> int:
        return await self._fallback_store.size()

    async def _publish_or_store(self, event: EventEnvelope, *, store_on_failure: bool) -> bool:
        if not await self._circuit_breaker.allow_request():
            if store_on_failure:
                await self._store_event(event, reason="circuit-open")
            return False
        try:
            producer = await self._ensure_producer()
            await asyncio.wait_for(
                producer.send_and_wait(event.topic, value=event.value, key=event.key),
                timeout=self._settings.kafka_send_timeout_seconds,
            )
        except Exception as exc:
            await self._circuit_breaker.record_failure()
            await self._reset_producer()
            logger.warning("Kafka publish failed event_id=%s topic=%s: %s", event.event_id, event.topic, exc)
            if store_on_failure:
                await self._store_event(event, reason="publish-failed")
            return False
        await self._circuit_breaker.record_success()
        logger.info("Kafka publish succeeded event_id=%s topic=%s", event.event_id, event.topic)
        return True

    async def _store_event(self, event: EventEnvelope, *, reason: str) -> None:
        await self._fallback_store.put(event)
        logger.info("Stored event in fallback queue event_id=%s reason=%s", event.event_id, reason)

    async def _ensure_producer(self) -> AIOKafkaProducer:
        async with self._producer_lock:
            if self._producer is not None:
                return self._producer
            producer = AIOKafkaProducer(
                bootstrap_servers=self._settings.kafka_bootstrap_servers.split(","),
                client_id=self._settings.kafka_client_id,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            )
            await asyncio.wait_for(producer.start(), timeout=self._settings.kafka_startup_timeout_seconds)
            self._producer = producer
            return producer

    async def _reset_producer(self) -> None:
        async with self._producer_lock:
            producer = self._producer
            self._producer = None
        if producer is not None:
            try:
                await producer.stop()
            except Exception:
                logger.exception("Failed while stopping Kafka producer after publish error")
