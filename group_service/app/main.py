import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from app.api.v1 import api_router
from app.core.config import get_settings
from app.events.kafka_producer import create_kafka_producer, stop_kafka_producer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("group-service")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    app.state.settings = settings

    # Kafka producer — retry loop handles slow Kafka startup
    producer = await create_kafka_producer(settings)
    app.state.kafka_producer = producer

    # httpx async client — shared across requests, closed on shutdown
    http_client = httpx.AsyncClient(timeout=settings.session_service_timeout_seconds)
    app.state.http_client = http_client

    logger.info("Group service startup complete")
    yield

    await stop_kafka_producer(producer)
    await http_client.aclose()
    logger.info("Group service shutdown complete")


def create_app() -> FastAPI:
    application = FastAPI(
        title="StudySync Group Service",
        version="0.1.0",
        lifespan=lifespan,
    )

    @application.get("/health", tags=["ops"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    application.include_router(api_router, prefix="/api/v1")
    return application


app = create_app()
