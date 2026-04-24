from __future__ import annotations

import asyncio
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Protocol
from uuid import uuid4


@dataclass(slots=True)
class EventEnvelope:
    topic: str
    key: bytes
    value: dict
    event_id: str = field(default_factory=lambda: str(uuid4()))
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    retry_count: int = 0


class EventStore(Protocol):
    async def put(self, event: EventEnvelope) -> None: ...
    async def get(self) -> EventEnvelope: ...
    async def requeue(self, event: EventEnvelope) -> None: ...
    async def size(self) -> int: ...


class InMemoryFallbackStore:
    def __init__(self) -> None:
        self._events: deque[EventEnvelope] = deque()
        self._condition = asyncio.Condition()

    async def put(self, event: EventEnvelope) -> None:
        async with self._condition:
            self._events.append(event)
            self._condition.notify()

    async def get(self) -> EventEnvelope:
        async with self._condition:
            while not self._events:
                await self._condition.wait()
            return self._events.popleft()

    async def requeue(self, event: EventEnvelope) -> None:
        async with self._condition:
            self._events.appendleft(event)
            self._condition.notify()

    async def size(self) -> int:
        async with self._condition:
            return len(self._events)
