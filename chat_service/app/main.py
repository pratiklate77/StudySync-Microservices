import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pymongo import ASCENDING

from app.api.v1 import api_router
from app.core.config import get_settings
from app.core.database import close_motor_client, get_database, get_motor_client
from app.core.redis_client import close_redis, create_redis
from app.events.kafka_consumer import GroupEventsConsumer
from app.kafka.circuit_breaker import CircuitBreaker
from app.kafka.fallback_store import InMemoryFallbackStore
from app.kafka.producer import ResilientKafkaProducer
from app.kafka.retry_worker import KafkaRetryWorker
from app.services.connection_manager import ConnectionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("chat-service")


async def _ensure_indexes() -> None:
    db = get_database()
    await db.messages.create_index([("group_id", ASCENDING), ("created_at", ASCENDING)], name="messages_group_time_idx")
    await db.messages.create_index([("group_id", ASCENDING), ("is_deleted", ASCENDING)], name="messages_group_deleted_idx")
    await db.group_memberships.create_index(
        [("group_id", ASCENDING), ("user_id", ASCENDING)],
        unique=True,
        name="memberships_group_user_unique",
    )
    await db.group_memberships.create_index([("group_id", ASCENDING), ("is_active", ASCENDING)], name="memberships_group_active_idx")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    app.state.settings = settings

    # MongoDB
    client = get_motor_client()
    await client.admin.command("ping")
    await _ensure_indexes()
    logger.info("MongoDB connected")

    # Redis
    redis = await create_redis(settings.redis_url)
    await redis.ping()
    app.state.redis = redis
    logger.info("Redis connected")

    # WebSocket connection manager — single shared instance
    app.state.connection_manager = ConnectionManager()

    # Kafka producer — ResilientKafkaProducer with circuit breaker + fallback
    fallback_store = InMemoryFallbackStore()
    circuit_breaker = CircuitBreaker(
        failure_threshold=settings.kafka_circuit_breaker_failure_threshold,
        recovery_timeout=settings.kafka_circuit_breaker_recovery_timeout_seconds,
    )
    producer = ResilientKafkaProducer(
        settings=settings,
        circuit_breaker=circuit_breaker,
        fallback_store=fallback_store,
    )
    connected = await producer.start()
    if not connected:
        logger.warning("Continuing startup with Kafka producer in fallback mode")

    retry_worker = KafkaRetryWorker(
        producer=producer,
        fallback_store=fallback_store,
        base_delay=settings.kafka_retry_base_delay_seconds,
        max_delay=settings.kafka_retry_max_delay_seconds,
    )
    retry_task = asyncio.create_task(retry_worker.run(), name="chat-kafka-retry-worker")
    app.state.kafka_producer = producer
    app.state.kafka_retry_task = retry_task

    # Kafka consumer — GROUP_EVENTS keeps local membership mirror in sync
    consumer = GroupEventsConsumer(settings)
    consumer_connected = await consumer.start()
    if not consumer_connected:
        logger.warning("Continuing startup without GROUP_EVENTS consumer")
    app.state.group_consumer = consumer

    logger.info("Chat service startup complete")
    yield

    # Shutdown
    await consumer.stop()
    await retry_worker.stop()
    await retry_task
    await producer.stop()
    await close_redis(redis)
    await close_motor_client()
    logger.info("Chat service shutdown complete")


def create_app() -> FastAPI:
    application = FastAPI(
        title="StudySync Chat Service",
        version="0.1.0",
        lifespan=lifespan,
    )

    @application.get("/health", tags=["ops"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    application.include_router(api_router, prefix="/api/v1")
    return application


app = create_app()
