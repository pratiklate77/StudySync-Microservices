import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from app.api.v1 import api_router
from app.core.config import get_settings
from app.kafka.circuit_breaker import CircuitBreaker
from app.kafka.fallback_store import InMemoryFallbackStore
from app.kafka.producer import ResilientKafkaProducer
from app.kafka.retry_worker import KafkaRetryWorker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("group-service")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    app.state.settings = settings

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
    retry_task = asyncio.create_task(retry_worker.run(), name="group-kafka-retry-worker")
    app.state.kafka_producer = producer
    app.state.kafka_retry_task = retry_task

    http_client = httpx.AsyncClient(timeout=settings.session_service_timeout_seconds)
    app.state.http_client = http_client

    logger.info("Group service startup complete")
    yield

    await retry_worker.stop()
    await retry_task
    await producer.stop()
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
