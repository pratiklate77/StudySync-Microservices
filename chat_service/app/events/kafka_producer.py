from uuid import UUID

from app.kafka.producer import ResilientKafkaProducer
from app.core.config import Settings


async def publish_message_sent(
    producer: ResilientKafkaProducer,
    settings: Settings,
    *,
    group_id: UUID,
    sender_id: UUID,
    message_id: UUID,
    preview: str,
) -> None:
    await producer.publish(
        topic=settings.kafka_chat_events_topic,
        value={
            "event_type": "CHAT_MESSAGE_SENT",
            "group_id": str(group_id),
            "sender_id": str(sender_id),
            "message_id": str(message_id),
            "preview": preview[:100],
        },
        key=str(group_id).encode("utf-8"),
    )


async def publish_message_deleted(
    producer: ResilientKafkaProducer,
    settings: Settings,
    *,
    group_id: UUID,
    message_id: UUID,
    deleted_by: UUID,
) -> None:
    await producer.publish(
        topic=settings.kafka_chat_events_topic,
        value={
            "event_type": "CHAT_MESSAGE_DELETED",
            "group_id": str(group_id),
            "message_id": str(message_id),
            "deleted_by": str(deleted_by),
        },
        key=str(group_id).encode("utf-8"),
    )
