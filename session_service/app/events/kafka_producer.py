import logging
from uuid import UUID

from app.core.config import Settings
from app.kafka.producer import ResilientKafkaProducer

logger = logging.getLogger(__name__)


async def publish_rating_submitted(
    producer: ResilientKafkaProducer,
    settings: Settings,
    *,
    tutor_id: UUID,
    student_id: UUID,
    score: int,
) -> None:
    published = await producer.publish(
        topic=settings.kafka_rating_events_topic,
        value={
            "event_type": "RATING_SUBMITTED",
            "tutor_id": str(tutor_id),
            "student_id": str(student_id),
            "score": score,
        },
        key=str(tutor_id).encode("utf-8"),
    )
    if published:
        logger.info("Published RATING_SUBMITTED tutor_id=%s score=%d", tutor_id, score)
    else:
        logger.warning("Queued RATING_SUBMITTED for retry tutor_id=%s", tutor_id)
