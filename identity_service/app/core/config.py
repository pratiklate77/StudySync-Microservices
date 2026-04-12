from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = (
        "postgresql+asyncpg://user:pass@localhost:5432/identity_db"
    )
    redis_url: str = "redis://localhost:6379/0"

    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_client_id: str = "identity-service"
    kafka_user_events_topic: str = "USER_EVENTS"
    kafka_rating_events_topic: str = "RATING_EVENTS"
    kafka_consumer_group: str = "identity-service-ratings"

    jwt_secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60 * 24

    top_tutors_cache_key: str = "marketplace:top_tutors"
    top_tutors_cache_ttl_seconds: int = 300

    admin_api_key: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
