# Group Service

Group Service manages study groups, group membership, role-based moderation, and internal group permission checks for other services.

It is built with FastAPI, SQLAlchemy (async), PostgreSQL, and Kafka, and runs on port `8002`.

## What This Service Does

- Creates, updates, lists, and soft-deletes study groups.
- Tracks group members and roles (`admin` or `member`).
- Enforces role-based actions (owner/admin/member authorization).
- Publishes group lifecycle and membership events to Kafka.
- Exposes internal endpoints for other services (membership + permissions checks).
- Proxies group-session linkage requests to Session Service.

## Tech Stack

- Python 3.12
- FastAPI + Uvicorn
- SQLAlchemy 2.x async + asyncpg
- Alembic migrations
- PostgreSQL
- aiokafka
- httpx
- PyJWT

## Service Boundaries

- This service **does not issue JWT tokens**.
- It validates bearer tokens using shared JWT secret (`JWT_SECRET_KEY`), expecting user id in the `sub` claim.
- Session ownership/business logic stays in Session Service; Group Service only proxies group-related session attachment/listing.

## Project Structure

- `app/main.py`: FastAPI app factory, lifespan, health endpoint, router mount.
- `app/api/v1/`: REST routes and dependencies.
- `app/services/`: business logic layer.
- `app/repositories/`: DB access layer.
- `app/models/`: SQLAlchemy ORM models.
- `app/schemas/`: request/response DTOs.
- `app/events/`: Kafka producer setup and event payload builders.
- `app/utils/permissions.py`: reusable authz guards.
- `alembic/`: database migrations.

## Runtime Lifecycle

On startup:

- Loads settings from environment (`.env`).
- Initializes shared Kafka producer (with retry loop).
- Initializes shared `httpx.AsyncClient` for Session Service calls.

On shutdown:

- Stops Kafka producer.
- Closes shared HTTP client.

Health check:

- `GET /health` -> `{"status":"ok"}`

## Data Model

### `groups`

- `id` (UUID, PK)
- `name` (string, indexed)
- `description` (text, nullable)
- `owner_id` (UUID, indexed)
- `is_private` (bool, default `false`)
- `max_members` (int, default `50`)
- `is_active` (bool, default `true`) -> soft delete flag
- `chat_enabled` (bool, default `true`)
- `created_at` (timestamp with timezone)

### `group_members`

- `id` (UUID, PK)
- `group_id` (UUID, FK -> `groups.id`, cascade delete)
- `user_id` (UUID, indexed)
- `role` (`admin` or `member`)
- `joined_at` (timestamp with timezone)
- unique constraint on (`group_id`, `user_id`)

## Authorization Rules

- **Authenticated routes** require `Authorization: Bearer <jwt>`.
- `sub` claim is parsed as current user UUID.
- Owner-only:
  - update group
  - delete group (soft delete)
  - demote admin/member
- Admin-or-owner:
  - kick members
  - promote members
- Owner cannot:
  - leave own group
  - be kicked
  - be demoted
- Joining private groups is forbidden without invite flow (not implemented here).

## API Endpoints

Base prefix: `/api/v1`

### Group Routes (`/groups`)

- `POST /groups/`
  - create group (creator becomes first `admin` member)
- `GET /groups/`
  - list active groups
  - query params: `limit` (1..100), `offset` (>=0), `search` (name contains)
- `GET /groups/{group_id}`
  - fetch one active group
- `PATCH /groups/{group_id}`
  - owner updates mutable fields (`name`, `description`, `is_private`, `max_members`, `chat_enabled`)
- `DELETE /groups/{group_id}`
  - owner soft-deletes group (`is_active=false`)

### Membership Routes (`/groups`)

- `POST /groups/{group_id}/join`
  - join non-private group if not already member and capacity not exceeded
- `POST /groups/{group_id}/leave`
  - leave group (owner forbidden)
- `GET /groups/{group_id}/members`
  - list group members (`limit`, `offset`)
- `POST /groups/{group_id}/kick`
  - remove target user (admin/owner only)
- `POST /groups/{group_id}/promote`
  - set target role to `admin` (idempotent)
- `POST /groups/{group_id}/demote`
  - set target role to `member` (owner only, idempotent)

### User Routes (`/users`)

- `GET /users/me/groups`
  - lists groups current user belongs to

### Internal Routes (`/internal`)

- `GET /internal/groups/{group_id}/members/{user_id}`
  - membership check for service-to-service use
  - response: `is_member` + optional `role`
- `GET /internal/groups/{group_id}/permissions/{user_id}`
  - checks if user can send messages in group (`chat_enabled` + membership)
  - response: `can_send_message` + optional `role`
- `GET /internal/groups/{group_id}/sessions`
  - proxies Session Service list with `group_id` filter
- `POST /internal/groups/{group_id}/sessions/{session_id}`
  - proxies Session Service patch to attach a group to session

## Request/Response Schemas

### Group create/update constraints

- `name`: 2..200 chars
- `description`: max 2000 chars
- `max_members`: 2..500

### Member payloads

- kick/promote/demote body:
  - `{ "user_id": "<uuid>" }`

### Role enum

- `admin`
- `member`

## Event Publishing

All events are published to topic from `KAFKA_GROUP_EVENTS_TOPIC` (default `GROUP_EVENTS`) with key `group_id`.

Event types:

- `GROUP_CREATED`
  - fields: `group_id`, `owner_id`, `name`
- `GROUP_DELETED`
  - fields: `group_id`, `owner_id`
- `USER_JOINED_GROUP`
  - fields: `group_id`, `user_id`, `role`
- `USER_LEFT_GROUP`
  - fields: `group_id`, `user_id`

## Configuration

Environment variables (see `.env.example`):

- `DATABASE_URL`
- `REDIS_URL`
- `KAFKA_BOOTSTRAP_SERVERS`
- `KAFKA_CLIENT_ID`
- `KAFKA_GROUP_EVENTS_TOPIC`
- `JWT_SECRET_KEY`
- `JWT_ALGORITHM`
- `SESSION_SERVICE_URL`
- `SESSION_SERVICE_TIMEOUT_SECONDS`

Notes:

- `JWT_SECRET_KEY` must match Identity Service secret.
- Use `kafka:29092` and service hostnames inside Docker network.
- `REDIS_URL` is currently configured but not actively used in application code.

## Local Development

From repository root:

1) Start infrastructure and services (or at least dependencies):

- `docker compose up -d postgres_group redis kafka zookeeper session_service`

2) Configure env:

- `cp group_service/.env.example group_service/.env`
- Adjust values as needed for your environment.

3) Install dependencies:

- `cd group_service`
- `python -m venv .venv`
- `source .venv/bin/activate`
- `pip install -r requirements.txt`

4) Run migrations:

- `alembic upgrade head`

5) Run API:

- `uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload`

## Docker Run

From repository root:

- `docker compose up -d group_service`

Service URL:

- `http://localhost:8002`

## Error Handling Patterns

Common status outcomes:

- `401` invalid/missing JWT
- `403` forbidden by role or owner-only restrictions
- `404` group not found/inactive
- `409` duplicate membership or capacity limits
- `503` dependency unavailable/timeouts (Kafka/session proxy availability)

## Migrations

- Initial migration: `001_initial_group_tables.py`
- Creates `groups` + `group_members` tables and indexes.
- Alembic environment resolves DB URL from runtime settings.

## Operational Notes

- Group deletion is soft (`is_active=false`), not hard delete.
- Member counts are computed from `group_members`.
- `list_groups` calculates member count per returned group (N+1 query behavior; acceptable for small pages, candidate for optimization later).
- Kafka producer startup includes retries to handle broker cold starts.

