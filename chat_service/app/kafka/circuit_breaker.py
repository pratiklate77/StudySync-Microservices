from __future__ import annotations

import asyncio
import time
from enum import Enum


class CircuitBreakerState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    def __init__(self, failure_threshold: int, recovery_timeout: float) -> None:
        self._failure_threshold = max(1, failure_threshold)
        self._recovery_timeout = recovery_timeout
        self._state = CircuitBreakerState.CLOSED
        self._failure_count = 0
        self._opened_at = 0.0
        self._half_open_in_flight = False
        self._lock = asyncio.Lock()

    async def allow_request(self) -> bool:
        async with self._lock:
            now = time.monotonic()
            if self._state == CircuitBreakerState.OPEN:
                if now - self._opened_at < self._recovery_timeout:
                    return False
                self._state = CircuitBreakerState.HALF_OPEN
                self._half_open_in_flight = False
            if self._state == CircuitBreakerState.HALF_OPEN:
                if self._half_open_in_flight:
                    return False
                self._half_open_in_flight = True
            return True

    async def record_success(self) -> None:
        async with self._lock:
            self._failure_count = 0
            self._state = CircuitBreakerState.CLOSED
            self._half_open_in_flight = False
            self._opened_at = 0.0

    async def record_failure(self) -> None:
        async with self._lock:
            self._failure_count += 1
            self._half_open_in_flight = False
            if self._state == CircuitBreakerState.HALF_OPEN or self._failure_count >= self._failure_threshold:
                self._state = CircuitBreakerState.OPEN
                self._opened_at = time.monotonic()
