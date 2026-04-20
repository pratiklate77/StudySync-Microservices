"""Run once at deploy time (or in CI) to create all MongoDB indexes.

Usage:
    python -m scripts.index_setup

Replaces Alembic migrations for this service. Safe to re-run — MongoDB
create_index is idempotent when the index spec is unchanged.
"""

import asyncio
import logging

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import get_settings

logger = logging.getLogger(__name__)


async def create_indexes() -> None:
    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_url)
    db = client[settings.mongodb_db_name]

    # ── sessions ──────────────────────────────────────────────────────────────
    sessions = db["sessions"]

    # 2dsphere index — required for $nearSphere geospatial queries
    await sessions.create_index([("location", "2dsphere")], name="idx_sessions_location_2dsphere")

    # Query patterns: list by host, sort by schedule
    await sessions.create_index([("host_id", 1)], name="idx_sessions_host_id")
    await sessions.create_index([("scheduled_time", 1)], name="idx_sessions_scheduled_time")
    await sessions.create_index([("status", 1)], name="idx_sessions_status")

    # Compound: nearby open sessions (status filter + geo)
    await sessions.create_index(
        [("status", 1), ("location", "2dsphere")],
        name="idx_sessions_status_location",
    )

    logger.info("sessions indexes created")

    # ── ratings ───────────────────────────────────────────────────────────────
    ratings = db["ratings"]

    # Unique constraint: one rating per student per session
    await ratings.create_index(
        [("session_id", 1), ("student_id", 1)],
        unique=True,
        name="idx_ratings_session_student_unique",
    )
    await ratings.create_index([("tutor_id", 1)], name="idx_ratings_tutor_id")

    logger.info("ratings indexes created")

    # ── verified_tutors ───────────────────────────────────────────────────────
    verified = db["verified_tutors"]

    # Unique on tutor_id — upsert target
    await verified.create_index(
        [("tutor_id", 1)],
        unique=True,
        name="idx_verified_tutors_tutor_id_unique",
    )

    logger.info("verified_tutors indexes created")
    client.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(create_indexes())
