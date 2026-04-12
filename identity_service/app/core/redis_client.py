from redis.asyncio import Redis


async def create_redis(url: str) -> Redis:
    return Redis.from_url(url, decode_responses=True, health_check_interval=30)


async def close_redis(client: Redis | None) -> None:
    if client is not None:
        await client.aclose()
