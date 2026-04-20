from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://studysync:studysync_dev@localhost:5432/group_db"
    redis_url: str = "redis://localhost:6379/2"

    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_client_id: str = "group-service"
    kafka_group_events_topic: str = "GROUP_EVENTS"

    jwt_secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    jwt_algorithm: str = "HS256"

    session_service_url: str = "http://localhost:8001"
    session_service_timeout_seconds: float = 5.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
