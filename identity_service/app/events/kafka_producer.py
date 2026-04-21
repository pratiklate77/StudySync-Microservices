from __future__ import annotations
import logging
from uuid import UUID

from app.core.config import Settings
from app.kafka.producer import ResilientKafkaProducer

logger = logging.getLogger(__name__)


async def publish_tutor_verified(
    producer: ResilientKafkaProducer,
    settings: Settings,
    *,
    user_id: UUID,
) -> bool:
    payload = {
        "event_type": "TUTOR_VERIFIED",
        "user_id": str(user_id),
    }
    published = await producer.publish(
        topic=settings.kafka_user_events_topic,
        value=payload,
        key=str(user_id).encode("utf-8"),
    )
    if published:
        logger.info("Published TUTOR_VERIFIED for user_id=%s", user_id)
    else:
        logger.warning("Queued TUTOR_VERIFIED for retry user_id=%s", user_id)
    return published
