import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.v1 import api_router
from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.redis_client import close_redis, create_redis
from app.events.kafka_consumer import RatingEventsConsumer
from app.kafka.circuit_breaker import CircuitBreaker
from app.kafka.fallback_store import InMemoryFallbackStore
from app.kafka.producer import ResilientKafkaProducer
from app.kafka.retry_worker import KafkaRetryWorker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("identity-service")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    app.state.settings = settings
    redis = await create_redis(settings.redis_url)
    await redis.ping()
    app.state.redis = redis

    fallback_store = InMemoryFallbackStore()
    circuit_breaker = CircuitBreaker(
        failure_threshold=settings.kafka_circuit_breaker_failure_threshold,
        recovery_timeout=settings.kafka_circuit_breaker_recovery_timeout_seconds,
    )
    publisher = ResilientKafkaProducer(
        settings=settings,
        circuit_breaker=circuit_breaker,
        fallback_store=fallback_store,
    )
    connected = await publisher.start()
    if not connected:
        logger.warning("Continuing startup with Kafka in fallback mode")

    retry_worker = KafkaRetryWorker(
        producer=publisher,
        fallback_store=fallback_store,
        base_delay=settings.kafka_retry_base_delay_seconds,
        max_delay=settings.kafka_retry_max_delay_seconds,
    )
    retry_task = asyncio.create_task(retry_worker.run(), name="identity-kafka-retry-worker")
    app.state.kafka_publisher = publisher
    app.state.kafka_retry_worker = retry_worker
    app.state.kafka_retry_task = retry_task

    consumer = RatingEventsConsumer(settings, AsyncSessionLocal, redis)
    consumer_connected = await consumer.start()
    if not consumer_connected:
        logger.warning("Continuing startup without rating events consumer")
    app.state.rating_consumer = consumer
    logger.info("Identity service startup complete")
    yield
    await consumer.stop()
    await retry_worker.stop()
    await retry_task
    await publisher.stop()
    await close_redis(redis)
    logger.info("Identity service shutdown complete")


def create_app() -> FastAPI:
    application = FastAPI(
        title="StudySync Identity & Profile Service",
        version="0.1.0",
        lifespan=lifespan,
    )

    @application.get("/health", tags=["ops"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    application.include_router(api_router, prefix="/api/v1")
    return application


app = create_app()
