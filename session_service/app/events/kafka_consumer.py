from __future__ import annotations

import asyncio
import json
import logging
from contextlib import suppress
from uuid import UUID

from aiokafka import AIOKafkaConsumer

from app.core.config import Settings
from app.core.database import get_database
from app.repositories.session_repository import SessionRepository
from app.repositories.verified_tutor_repository import VerifiedTutorRepository

logger = logging.getLogger(__name__)


class PaymentEventsConsumer:
    """Consumes PAYMENT_SUCCESS from PAYMENT_EVENTS topic.
    Flow: Payment Service → Kafka → this consumer → SessionRepository.add_participant()
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._consumer: AIOKafkaConsumer | None = None
        self._task: asyncio.Task[None] | None = None

    async def start(self, retries: int | None = None, delay: float | None = None) -> bool:
        max_retries = retries if retries is not None else self._settings.kafka_startup_max_retries
        retry_delay = delay if delay is not None else self._settings.kafka_startup_retry_delay_seconds

        for attempt in range(1, max_retries + 1):
            consumer = AIOKafkaConsumer(
                self._settings.kafka_payment_events_topic,
                bootstrap_servers=self._settings.kafka_bootstrap_servers.split(","),
                group_id=self._settings.kafka_consumer_group,
                client_id=f"{self._settings.kafka_client_id}-payment-consumer",
                enable_auto_commit=True,
                auto_offset_reset="earliest",
                value_deserializer=lambda v: json.loads(v.decode("utf-8")),
            )
            try:
                await asyncio.wait_for(
                    consumer.start(),
                    timeout=self._settings.kafka_startup_timeout_seconds,
                )
                self._consumer = consumer
                self._task = asyncio.create_task(self._run_loop(), name="session-payment-consumer")
                logger.info("PaymentEventsConsumer connected on attempt %d", attempt)
                return True
            except Exception as exc:
                logger.warning("PaymentEventsConsumer startup attempt %d/%d failed: %s", attempt, max_retries, exc)
                try:
                    await consumer.stop()
                except Exception:
                    pass
                if attempt < max_retries:
                    await asyncio.sleep(retry_delay)

        logger.error("PaymentEventsConsumer unavailable after %d attempts", max_retries)
        return False

    async def _run_loop(self) -> None:
        assert self._consumer is not None
        try:
            async for msg in self._consumer:
                try:
                    data = msg.value
                    if not isinstance(data, dict):
                        continue
                    if data.get("event_type") != "PAYMENT_SUCCESS":
                        continue
                    session_id_raw = data.get("session_id")
                    student_id_raw = data.get("student_id")
                    if not session_id_raw or not student_id_raw:
                        continue
                    db = get_database()
                    repo = SessionRepository(db)
                    added = await repo.add_participant(
                        UUID(str(session_id_raw)),
                        UUID(str(student_id_raw)),
                    )
                    if added:
                        logger.info("PAYMENT_SUCCESS: student %s joined session %s", student_id_raw, session_id_raw)
                    else:
                        logger.warning("PAYMENT_SUCCESS: duplicate or full — student %s session %s", student_id_raw, session_id_raw)
                except Exception:
                    logger.exception("Failed processing PAYMENT_SUCCESS message")
        except asyncio.CancelledError:
            logger.info("PaymentEventsConsumer task cancelled")
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


class UserEventsConsumer:
    """Consumes TUTOR_VERIFIED from USER_EVENTS topic.
    Flow: Identity Service → Kafka → this consumer → VerifiedTutorRepository.upsert()
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._consumer: AIOKafkaConsumer | None = None
        self._task: asyncio.Task[None] | None = None

    async def start(self, retries: int | None = None, delay: float | None = None) -> bool:
        max_retries = retries if retries is not None else self._settings.kafka_startup_max_retries
        retry_delay = delay if delay is not None else self._settings.kafka_startup_retry_delay_seconds

        for attempt in range(1, max_retries + 1):
            consumer = AIOKafkaConsumer(
                self._settings.kafka_user_events_topic,
                bootstrap_servers=self._settings.kafka_bootstrap_servers.split(","),
                group_id=self._settings.kafka_consumer_group,
                client_id=f"{self._settings.kafka_client_id}-user-consumer",
                enable_auto_commit=True,
                auto_offset_reset="earliest",
                value_deserializer=lambda v: json.loads(v.decode("utf-8")),
            )
            try:
                await asyncio.wait_for(
                    consumer.start(),
                    timeout=self._settings.kafka_startup_timeout_seconds,
                )
                self._consumer = consumer
                self._task = asyncio.create_task(self._run_loop(), name="session-user-consumer")
                logger.info("UserEventsConsumer connected on attempt %d", attempt)
                return True
            except Exception as exc:
                logger.warning("UserEventsConsumer startup attempt %d/%d failed: %s", attempt, max_retries, exc)
                try:
                    await consumer.stop()
                except Exception:
                    pass
                if attempt < max_retries:
                    await asyncio.sleep(retry_delay)

        logger.error("UserEventsConsumer unavailable after %d attempts", max_retries)
        return False

    async def _run_loop(self) -> None:
        assert self._consumer is not None
        try:
            async for msg in self._consumer:
                try:
                    data = msg.value
                    if not isinstance(data, dict):
                        continue
                    if data.get("event_type") != "TUTOR_VERIFIED":
                        continue
                    user_id_raw = data.get("user_id")
                    if not user_id_raw:
                        continue
                    db = get_database()
                    repo = VerifiedTutorRepository(db)
                    await repo.upsert(UUID(str(user_id_raw)))
                    logger.info("TUTOR_VERIFIED: marked tutor %s as verified", user_id_raw)
                except Exception:
                    logger.exception("Failed processing TUTOR_VERIFIED message")
        except asyncio.CancelledError:
            logger.info("UserEventsConsumer task cancelled")
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
