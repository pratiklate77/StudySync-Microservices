from __future__ import annotations
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "chat_db"

    redis_url: str = "redis://localhost:6379/3"

    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_client_id: str = "chat-service"
    kafka_group_events_topic: str = "GROUP_EVENTS"
    kafka_chat_events_topic: str = "CHAT_EVENTS"
    kafka_consumer_group: str = "chat-service-group"
    kafka_send_timeout_seconds: float = 5.0
    kafka_startup_timeout_seconds: float = 10.0
    kafka_startup_max_retries: int = 5
    kafka_startup_retry_delay_seconds: float = 3.0
    kafka_circuit_breaker_failure_threshold: int = 3
    kafka_circuit_breaker_recovery_timeout_seconds: float = 30.0
    kafka_retry_base_delay_seconds: float = 2.0
    kafka_retry_max_delay_seconds: float = 30.0

    jwt_secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    jwt_algorithm: str = "HS256"

    recent_messages_cache_ttl_seconds: int = 600  # 10 minutes
    recent_messages_cache_limit: int = 50

    group_service_url: str = "http://localhost:8002"


@lru_cache
def get_settings() -> Settings:
    return Settings()
