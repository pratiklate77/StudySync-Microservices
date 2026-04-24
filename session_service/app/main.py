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
from app.events.kafka_consumer import PaymentEventsConsumer, UserEventsConsumer
from app.kafka.circuit_breaker import CircuitBreaker
from app.kafka.fallback_store import InMemoryFallbackStore
from app.kafka.producer import ResilientKafkaProducer
from app.kafka.retry_worker import KafkaRetryWorker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("session-service")


async def _ensure_indexes() -> None:
    db = get_database()
    await db.sessions.create_index([("location", "2dsphere")], name="sessions_location_2dsphere")
    await db.sessions.create_index([("status", ASCENDING)], name="sessions_status_idx")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    app.state.settings = settings

    mode_info = f"AUTH: {settings.AUTH_ENABLED} | Kafka: {settings.KAFKA_ENABLED} | Standalone: {settings.STANDALONE_MODE}"
    if settings.TEST_USER_ID:
        mode_info += f" | TestUser: {settings.TEST_USER_ID}"
    logger.info("Session service starting — %s", mode_info)

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

    # Kafka — optional based on KAFKA_ENABLED
    app.state.kafka_producer = None
    app.state.payment_consumer = None
    app.state.user_consumer = None

    if settings.KAFKA_ENABLED:
        try:
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
                logger.warning("Kafka producer in fallback mode")

            retry_worker = KafkaRetryWorker(
                producer=producer,
                fallback_store=fallback_store,
                base_delay=settings.kafka_retry_base_delay_seconds,
                max_delay=settings.kafka_retry_max_delay_seconds,
            )
            retry_task = asyncio.create_task(retry_worker.run(), name="session-kafka-retry-worker")
            app.state.kafka_producer = producer
            app.state.kafka_retry_worker = retry_worker
            app.state.kafka_retry_task = retry_task
            logger.info("Kafka producer ready")

            payment_consumer = PaymentEventsConsumer(settings)
            consumer_ok = await payment_consumer.start()
            if not consumer_ok:
                logger.warning("Continuing without PaymentEventsConsumer")
            app.state.payment_consumer = payment_consumer

            user_consumer = UserEventsConsumer(settings)
            consumer_ok = await user_consumer.start()
            if not consumer_ok:
                logger.warning("Continuing without UserEventsConsumer")
            app.state.user_consumer = user_consumer

        except Exception as exc:
            logger.error("Kafka initialization failed: %s", exc)
            if not settings.STANDALONE_MODE:
                raise
            logger.warning("Continuing in standalone mode without Kafka")
    else:
        logger.info("Kafka disabled (KAFKA_ENABLED=false)")

    logger.info("Session service startup complete")
    yield

    # Shutdown
    if settings.KAFKA_ENABLED:
        if app.state.payment_consumer:
            await app.state.payment_consumer.stop()
        if app.state.user_consumer:
            await app.state.user_consumer.stop()
        if app.state.kafka_producer:
            retry_worker = getattr(app.state, "kafka_retry_worker", None)
            retry_task = getattr(app.state, "kafka_retry_task", None)
            if retry_worker:
                await retry_worker.stop()
            if retry_task:
                await retry_task
            await app.state.kafka_producer.stop()

    await close_redis(redis)
    await close_motor_client()
    logger.info("Session service shutdown complete")


def create_app() -> FastAPI:
    application = FastAPI(
        title="StudySync Session Service",
        version="0.1.0",
        lifespan=lifespan,
    )

    @application.get("/health", tags=["ops"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @application.get("/health/ready", tags=["ops"])
    async def health_ready() -> dict:
        settings = get_settings()
        return {
            "status": "ready",
            "auth_enabled": settings.AUTH_ENABLED,
            "kafka_enabled": settings.KAFKA_ENABLED,
            "standalone_mode": settings.STANDALONE_MODE,
            "test_user_id": settings.TEST_USER_ID or "not-set",
        }

    application.include_router(api_router, prefix="/api/v1")
    return application


app = create_app()
