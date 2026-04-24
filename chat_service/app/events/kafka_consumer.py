from __future__ import annotations

import asyncio
import json
import logging
from contextlib import suppress
from uuid import UUID

from aiokafka import AIOKafkaConsumer

from app.core.config import Settings
from app.core.database import get_database
from app.repositories.membership_repository import MembershipRepository

logger = logging.getLogger(__name__)


class GroupEventsConsumer:
    """Consumes GROUP_EVENTS from group_service.

    Keeps local group_memberships collection in sync so chat service
    never needs to call group_service over HTTP to check membership.

    Events handled:
      GROUP_CREATED      → upsert owner as admin member
      USER_JOINED_GROUP  → upsert member
      USER_LEFT_GROUP    → deactivate membership
      GROUP_DELETED      → deactivate all memberships for that group
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
                self._settings.kafka_group_events_topic,
                bootstrap_servers=self._settings.kafka_bootstrap_servers.split(","),
                group_id=self._settings.kafka_consumer_group,
                client_id=f"{self._settings.kafka_client_id}-group-consumer",
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
                self._task = asyncio.create_task(self._run_loop(), name="chat-group-events-consumer")
                logger.info("GroupEventsConsumer connected on attempt %d", attempt)
                return True
            except Exception as exc:
                logger.warning("GroupEventsConsumer startup attempt %d/%d failed: %s", attempt, max_retries, exc)
                try:
                    await consumer.stop()
                except Exception:
                    pass
                if attempt < max_retries:
                    await asyncio.sleep(retry_delay)

        logger.error("GroupEventsConsumer unavailable after %d attempts", max_retries)
        return False

    async def _run_loop(self) -> None:
        assert self._consumer is not None
        try:
            async for msg in self._consumer:
                try:
                    await self._handle(msg.value)
                except Exception:
                    logger.exception("Failed processing GROUP_EVENTS message")
        except asyncio.CancelledError:
            logger.info("GroupEventsConsumer task cancelled")
            raise

    async def _handle(self, data: dict) -> None:
        if not isinstance(data, dict):
            return
        event_type = data.get("event_type")
        db = get_database()
        repo = MembershipRepository(db)

        if event_type == "GROUP_CREATED":
            group_id = UUID(str(data["group_id"]))
            owner_id = UUID(str(data["owner_id"]))
            await repo.upsert(group_id, owner_id, role="admin")
            logger.info("GROUP_CREATED: group=%s owner=%s", group_id, owner_id)

        elif event_type == "USER_JOINED_GROUP":
            group_id = UUID(str(data["group_id"]))
            user_id = UUID(str(data["user_id"]))
            role = data.get("role", "member")
            await repo.upsert(group_id, user_id, role=role)
            logger.info("USER_JOINED_GROUP: group=%s user=%s", group_id, user_id)

        elif event_type == "USER_LEFT_GROUP":
            group_id = UUID(str(data["group_id"]))
            user_id = UUID(str(data["user_id"]))
            await repo.deactivate(group_id, user_id)
            logger.info("USER_LEFT_GROUP: group=%s user=%s", group_id, user_id)

        elif event_type == "GROUP_DELETED":
            group_id = UUID(str(data["group_id"]))
            await repo.deactivate_group(group_id)
            logger.info("GROUP_DELETED: group=%s", group_id)

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        if self._consumer is not None:
            await self._consumer.stop()
            self._consumer = None
