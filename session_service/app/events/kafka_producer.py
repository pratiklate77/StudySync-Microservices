import json
import logging
from uuid import UUID

from aiokafka import AIOKafkaProducer

from app.core.config import Settings

logger = logging.getLogger(__name__)


async def create_kafka_producer(settings: Settings) -> AIOKafkaProducer | None:
    """Create Kafka producer if KAFKA_ENABLED, else return None."""
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


async def publish_rating_submitted(
    producer: AIOKafkaProducer | None,
    settings: Settings,
    *,
    tutor_id: UUID,
    student_id: UUID,
    score: int,
) -> None:
    """Emit RATING_SUBMITTED → consumed by Identity Service RatingEventsConsumer.
    
    ✅ DEV: If Kafka disabled (producer=None), logs message and returns safely.
    ✅ PROD: Publishes event to Kafka topic.
    """
    if producer is None:
        logger.debug(
            "Kafka disabled: skipping RATING_SUBMITTED event "
            f"(tutor_id={tutor_id}, score={score})"
        )
        return
    
    payload = {
        "event_type": "RATING_SUBMITTED",
        "tutor_id": str(tutor_id),
        "student_id": str(student_id),
        "score": score,
    }
    await producer.send_and_wait(
        settings.kafka_rating_events_topic,
        value=payload,
        key=str(tutor_id).encode("utf-8"),   # partition by tutor for ordering
    )
    logger.info("Published RATING_SUBMITTED tutor_id=%s score=%d", tutor_id, score)
