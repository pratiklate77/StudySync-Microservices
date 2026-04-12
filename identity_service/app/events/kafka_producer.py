import json
import logging
from uuid import UUID

from aiokafka import AIOKafkaProducer

from app.core.config import Settings

logger = logging.getLogger(__name__)


async def create_kafka_producer(settings: Settings) -> AIOKafkaProducer:
    producer = AIOKafkaProducer(
        bootstrap_servers=settings.kafka_bootstrap_servers.split(","),
        client_id=settings.kafka_client_id,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    )
    await producer.start()
    return producer


async def stop_kafka_producer(producer: AIOKafkaProducer | None) -> None:
    if producer is not None:
        await producer.stop()


async def publish_tutor_verified(
    producer: AIOKafkaProducer,
    settings: Settings,
    *,
    user_id: UUID,
) -> None:
    payload = {
        "event_type": "TUTOR_VERIFIED",
        "user_id": str(user_id),
    }
    await producer.send_and_wait(
        settings.kafka_user_events_topic,
        value=payload,
        key=str(user_id).encode("utf-8"),
    )
    logger.info("Published TUTOR_VERIFIED for user_id=%s", user_id)
