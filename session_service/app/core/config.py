from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    AUTH_ENABLED: bool = True
    KAFKA_ENABLED: bool = True
    STANDALONE_MODE: bool = False
    TEST_USER_ID: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "session_db"

    redis_url: str = "redis://localhost:6379/1"

    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_client_id: str = "session-service"
    kafka_payment_events_topic: str = "PAYMENT_EVENTS"
    kafka_user_events_topic: str = "USER_EVENTS"
    kafka_rating_events_topic: str = "RATING_EVENTS"
    kafka_consumer_group: str = "session-service-group"

    # Shared with identity service — same secret, decode-only (no token issuance)
    jwt_secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    jwt_algorithm: str = "HS256"

    nearby_sessions_cache_ttl_seconds: int = 60

    @field_validator("STANDALONE_MODE", mode="after")
    @classmethod
    def validate_standalone_mode(cls, v, info):
        """Ensure STANDALONE_MODE enforces required settings."""
        if v:
            data = info.data
            if data.get("AUTH_ENABLED", True) is True:
                raise ValueError(
                    "STANDALONE_MODE=true requires AUTH_ENABLED=false. "
                    "Set AUTH_ENABLED=false in .env or .env.standalone"
                )
            if data.get("KAFKA_ENABLED", True) is True:
                raise ValueError(
                    "STANDALONE_MODE=true requires KAFKA_ENABLED=false. "
                    "Set KAFKA_ENABLED=false in .env or .env.standalone"
                )
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
