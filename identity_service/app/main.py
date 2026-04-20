import logging
import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.v1 import api_router
from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.redis_client import close_redis, create_redis
from app.events.kafka_consumer import RatingEventsConsumer
from app.events.kafka_producer import create_kafka_producer, stop_kafka_producer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("identity-service")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    app.state.settings = settings
    redis = await create_redis(settings.redis_url)
    await redis.ping()
    app.state.redis = redis
    await asyncio.sleep(10)
    producer = await create_kafka_producer(settings)
    app.state.kafka_producer = producer
    consumer = RatingEventsConsumer(settings, AsyncSessionLocal, redis)
    await consumer.start()
    app.state.rating_consumer = consumer
    logger.info("Identity service startup complete")
    yield
    await consumer.stop()
    await stop_kafka_producer(producer)
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
