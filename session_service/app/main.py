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
from app.events.kafka_producer import create_kafka_producer, stop_kafka_producer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("session-service")


async def _ensure_indexes() -> None:
    db = get_database()
    await db.sessions.create_index([("location", "2dsphere")], name="sessions_location_2dsphere")
    await db.sessions.create_index([("status", ASCENDING)], name="sessions_status_idx")


async def _create_producer_with_retry(settings, retries: int = 10, delay: float = 5.0):
    for attempt in range(1, retries + 1):
        try:
            return await create_kafka_producer(settings)
        except Exception as exc:
            if attempt == retries:
                raise
            logger.warning("Kafka not ready (attempt %d/%d): %s — retrying in %.0fs", attempt, retries, exc, delay)
            await asyncio.sleep(delay)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    app.state.settings = settings

    # Report startup mode
    mode_info = f"AUTH: {settings.AUTH_ENABLED} | Kafka: {settings.KAFKA_ENABLED} | Standalone: {settings.STANDALONE_MODE}"
    if settings.TEST_USER_ID:
        mode_info += f" | TestUser: {settings.TEST_USER_ID}"
    logger.info(f"Session service starting — {mode_info}")

    # Connect to MongoDB
    client = get_motor_client()
    await client.admin.command("ping")
    await _ensure_indexes()
    logger.info("✅ MongoDB connected")

    # Connect to Redis
    redis = await create_redis(settings.redis_url)
    await redis.ping()
    app.state.redis = redis
    logger.info("✅ Redis connected")

    # ✅ Kafka: Optional based on KAFKA_ENABLED
    producer = None
    app.state.payment_consumer = None
    app.state.user_consumer = None
    
    if settings.KAFKA_ENABLED:
        try:
            producer = await _create_producer_with_retry(settings)
            app.state.kafka_producer = producer
            logger.info("✅ Kafka producer created")

            payment_consumer = PaymentEventsConsumer(settings)
            await payment_consumer.start()
            app.state.payment_consumer = payment_consumer
            logger.info("✅ Payment events consumer started")

            user_consumer = UserEventsConsumer(settings)
            await user_consumer.start()
            app.state.user_consumer = user_consumer
            logger.info("✅ User events consumer started")
        except Exception as exc:
            logger.error(f"⚠️  Kafka initialization failed: {exc}")
            if not settings.STANDALONE_MODE:
                raise
            logger.warning("Continuing in standalone mode without Kafka")
    else:
        logger.info("⏭️  Kafka disabled (KAFKA_ENABLED=false)")
        app.state.kafka_producer = None

    logger.info("Session service startup complete")
    yield

    # Shutdown
    if settings.KAFKA_ENABLED:
        if app.state.payment_consumer:
            await app.state.payment_consumer.stop()
        if app.state.user_consumer:
            await app.state.user_consumer.stop()
        await stop_kafka_producer(producer)
    
    await close_redis(redis)
    await close_motor_client()
    logger.info("Session service shutdown complete")


def create_app() -> FastAPI:
    application = FastAPI(
        title="StudySync Session & Group Service",
        version="0.1.0",
        lifespan=lifespan,
    )

    @application.get("/health", tags=["ops"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @application.get("/health/ready", tags=["ops"])
    async def health_ready() -> dict:
        """Readiness probe with mode information."""
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
