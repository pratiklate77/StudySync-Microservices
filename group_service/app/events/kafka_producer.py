import logging
from uuid import UUID

from app.core.config import Settings
from app.kafka.producer import ResilientKafkaProducer

logger = logging.getLogger(__name__)


async def publish_event(
    producer: ResilientKafkaProducer,
    settings: Settings,
    payload: dict,
    key: str,
) -> None:
    published = await producer.publish(
        topic=settings.kafka_group_events_topic,
        value=payload,
        key=key.encode("utf-8"),
    )
    if published:
        logger.info("Published %s key=%s", payload.get("event_type"), key)
    else:
        logger.warning("Queued %s for retry key=%s", payload.get("event_type"), key)
