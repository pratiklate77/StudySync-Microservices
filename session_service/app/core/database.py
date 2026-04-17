from collections.abc import AsyncGenerator

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import get_settings

_settings = get_settings()

# Single shared Motor client — Motor manages its own connection pool internally
_client: AsyncIOMotorClient | None = None


def get_motor_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(
            _settings.mongodb_url,
            uuidRepresentation="standard"
        )
    return _client


def get_database() -> AsyncIOMotorDatabase:
    return get_motor_client()[_settings.mongodb_db_name]


async def close_motor_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None


# FastAPI dependency — yields the database handle (analogous to get_db in identity service)
async def get_db() -> AsyncGenerator[AsyncIOMotorDatabase, None]:
    yield get_database()
