import asyncio
import json
import logging

from aiokafka import AIOKafkaProducer

from app.core.config import Settings

logger = logging.getLogger(__name__)


async def create_kafka_producer(settings: Settings, retries: int = 10, delay: float = 5.0) -> AIOKafkaProducer:
    """Create and start a Kafka producer with retry — Kafka may not be ready at container startup."""
    producer = AIOKafkaProducer(
        bootstrap_servers=settings.kafka_bootstrap_servers.split(","),
        client_id=settings.kafka_client_id,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    )
    for attempt in range(1, retries + 1):
        try:
            await producer.start()
            logger.info("Kafka producer connected on attempt %d", attempt)
            return producer
        except Exception as exc:
            if attempt == retries:
                raise
            logger.warning(
                "Kafka not ready (attempt %d/%d): %s — retrying in %.0fs",
                attempt, retries, exc, delay,
            )
            await asyncio.sleep(delay)
    raise RuntimeError("unreachable")  # pragma: no cover


async def stop_kafka_producer(producer: AIOKafkaProducer | None) -> None:
    if producer is not None:
        await producer.stop()


async def publish_event(producer: AIOKafkaProducer, settings: Settings, payload: dict, key: str) -> None:
    """Generic publish — all group events go to GROUP_EVENTS topic, keyed by group_id."""
    await producer.send_and_wait(
        settings.kafka_group_events_topic,
        value=payload,
        key=key.encode("utf-8"),
    )
    logger.info("Published %s key=%s", payload.get("event_type"), key)
