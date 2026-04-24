# Database Guide

This document is the database reference for the StudySync microservices repository. It explains:

- which database each service owns
- which technology each service uses
- how to run migrations or schema setup
- how to connect from the terminal
- how to inspect data with queries
- how Docker and local development differ

The goal is to keep database operations documented service-by-service in one place.

## Database Overview

| Service | Primary Database | DB Name | Host Port | Docker Service Name | Migration Style |
|---|---|---|---:|---|---|
| Identity Service | PostgreSQL | `identity_db` | `5432` | `postgres` | Alembic |
| Group Service | PostgreSQL | `group_db` | `5433` | `postgres_group` | Alembic |
| Chat Service | PostgreSQL | `chat_db` | `5434` | `postgres_chat` | Alembic |
| Session Service | MongoDB | `session_db` | `27017` | `mongo` | No Alembic; runtime indexes |

## Shared Database Containers

Defined in [docker-compose.yml](/home/pratik/project/StudySync-Microservices/docker-compose.yml:1):

- `studysync-postgres` for Identity Service
- `studysync-postgres-group` for Group Service
- `studysync-postgres-chat` for Chat Service
- `studysync-mongo` for Session Service
- `studysync-redis` for Redis-backed caches and Pub/Sub

## Quick Start

Start the data infrastructure:

```bash
docker compose up -d postgres postgres_group postgres_chat mongo redis zookeeper kafka
```

Start the full stack:

```bash
docker compose up -d --build
```

## Connection Rules

### If your app runs on your machine with `uvicorn`

Use `localhost` and the published ports:

- Identity Postgres: `localhost:5432`
- Group Postgres: `localhost:5433`
- Chat Postgres: `localhost:5434`
- MongoDB: `localhost:27017`

### If your app runs inside Docker Compose

Use Docker service names:

- Identity Postgres: `postgres:5432`
- Group Postgres: `postgres_group:5432`
- Chat Postgres: `postgres_chat:5432`
- MongoDB: `mongo:27017`

## Identity Service Database

### Service Ownership

Identity Service owns:

- users
- tutor profiles
- tutor/rating-related relational data

Relevant files:

- [identity_service/app/core/config.py](/home/pratik/project/StudySync-Microservices/identity_service/app/core/config.py:1)
- [identity_service/alembic.ini](/home/pratik/project/StudySync-Microservices/identity_service/alembic.ini:1)
- [identity_service/alembic/versions/001_initial_identity_tables.py](/home/pratik/project/StudySync-Microservices/identity_service/alembic/versions/001_initial_identity_tables.py:1)

### Database Type

- PostgreSQL
- Async access through SQLAlchemy + `asyncpg`
- Schema migrations through Alembic

### Default Database Settings

Host-local app default:

```env
DATABASE_URL=postgresql+asyncpg://studysync:studysync_dev@localhost:5432/identity_db
```

Docker container database host:

```env
DATABASE_URL=postgresql+asyncpg://studysync:studysync_dev@postgres:5432/identity_db
```

### Run Migrations

From repo root:

```bash
cd identity_service
alembic upgrade head
```

If using a virtual environment:

```bash
cd identity_service
source .venv/bin/activate
alembic upgrade head
```

Create a new migration revision:

```bash
cd identity_service
alembic revision -m "describe_change"
```

Autogenerate a migration:

```bash
cd identity_service
alembic revision --autogenerate -m "describe_change"
```

Check current migration version:

```bash
cd identity_service
alembic current
```

Show migration history:

```bash
cd identity_service
alembic history
```

### Connect To Identity Postgres From Terminal

From your host machine:

```bash
psql -h localhost -p 5432 -U studysync -d identity_db
```

From inside the Postgres container:

```bash
docker exec -it studysync-postgres psql -U studysync -d identity_db
```

### Useful Identity SQL Queries

List tables:

```sql
\dt
```

Describe a table:

```sql
\d users
```

See recent users:

```sql
SELECT id, email, full_name, created_at
FROM users
ORDER BY created_at DESC
LIMIT 20;
```

See tutor profiles:

```sql
SELECT *
FROM tutor_profiles
LIMIT 20;
```

## Group Service Database

### Service Ownership

Group Service owns:

- groups
- group membership
- group-level moderation and chat permissions

Relevant files:

- [group_service/app/core/config.py](/home/pratik/project/StudySync-Microservices/group_service/app/core/config.py:1)
- [group_service/alembic.ini](/home/pratik/project/StudySync-Microservices/group_service/alembic.ini:1)
- [group_service/alembic/versions/001_initial_group_tables.py](/home/pratik/project/StudySync-Microservices/group_service/alembic/versions/001_initial_group_tables.py:1)
- [group_service/app/models/group.py](/home/pratik/project/StudySync-Microservices/group_service/app/models/group.py:1)
- [group_service/app/models/group_member.py](/home/pratik/project/StudySync-Microservices/group_service/app/models/group_member.py:1)

### Database Type

- PostgreSQL
- Async SQLAlchemy + `asyncpg`
- Alembic migrations

### Default Database Settings

Host-local app default:

```env
DATABASE_URL=postgresql+asyncpg://studysync:studysync_dev@localhost:5433/group_db
```

Docker container database host:

```env
DATABASE_URL=postgresql+asyncpg://studysync:studysync_dev@postgres_group:5432/group_db
```

### Run Migrations

```bash
cd group_service
alembic upgrade head
```

Create a new migration:

```bash
cd group_service
alembic revision -m "describe_change"
```

Autogenerate a migration:

```bash
cd group_service
alembic revision --autogenerate -m "describe_change"
```

Check current version:

```bash
cd group_service
alembic current
```

### Connect To Group Postgres From Terminal

From your host machine:

```bash
psql -h localhost -p 5433 -U studysync -d group_db
```

From inside the Postgres container:

```bash
docker exec -it studysync-postgres-group psql -U studysync -d group_db
```

### Useful Group SQL Queries

List tables:

```sql
\dt
```

Describe groups table:

```sql
\d groups
```

Recent groups:

```sql
SELECT id, name, owner_id, is_private, is_active, created_at
FROM groups
ORDER BY created_at DESC
LIMIT 20;
```

Members in a specific group:

```sql
SELECT gm.user_id, gm.role, gm.joined_at
FROM group_members gm
WHERE gm.group_id = 'PUT-GROUP-UUID-HERE'
ORDER BY gm.joined_at ASC;
```

Group membership counts:

```sql
SELECT g.id, g.name, COUNT(gm.id) AS member_count
FROM groups g
LEFT JOIN group_members gm ON gm.group_id = g.id
GROUP BY g.id, g.name
ORDER BY member_count DESC;
```

## Chat Service Database

### Service Ownership

Chat Service owns:

- chat room projection per group
- room membership projection
- messages
- read receipts

Relevant files:

- [chat_service/app/core/config.py](/home/pratik/project/StudySync-Microservices/chat_service/app/core/config.py:1)
- [chat_service/alembic.ini](/home/pratik/project/StudySync-Microservices/chat_service/alembic.ini:1)
- [chat_service/alembic/versions/001_initial_chat_tables.py](/home/pratik/project/StudySync-Microservices/chat_service/alembic/versions/001_initial_chat_tables.py:1)
- [chat_service/app/models/chat_room.py](/home/pratik/project/StudySync-Microservices/chat_service/app/models/chat_room.py:1)
- [chat_service/app/models/room_member.py](/home/pratik/project/StudySync-Microservices/chat_service/app/models/room_member.py:1)
- [chat_service/app/models/message.py](/home/pratik/project/StudySync-Microservices/chat_service/app/models/message.py:1)
- [chat_service/app/models/read_receipt.py](/home/pratik/project/StudySync-Microservices/chat_service/app/models/read_receipt.py:1)

### Database Type

- PostgreSQL
- Async SQLAlchemy + `asyncpg`
- Alembic migrations

### Default Database Settings

Host-local app default:

```env
DATABASE_URL=postgresql+asyncpg://studysync:studysync_dev@localhost:5434/chat_db
```

Docker container database host:

```env
DATABASE_URL=postgresql+asyncpg://studysync:studysync_dev@postgres_chat:5432/chat_db
```

### Run Migrations

```bash
cd chat_service
alembic upgrade head
```

Create a new migration:

```bash
cd chat_service
alembic revision -m "describe_change"
```

Autogenerate a migration:

```bash
cd chat_service
alembic revision --autogenerate -m "describe_change"
```

Check current version:

```bash
cd chat_service
alembic current
```

### Connect To Chat Postgres From Terminal

From your host machine:

```bash
psql -h localhost -p 5434 -U studysync -d chat_db
```

From inside the Postgres container:

```bash
docker exec -it studysync-postgres-chat psql -U studysync -d chat_db

docker compose exec chat_service alembic upgrade head

```

### Useful Chat SQL Queries

List tables:

```sql
\dt
```

Describe messages table:

```sql
\d messages
```

Recent messages:

```sql
SELECT id, group_id, sender_id, status, created_at, content
FROM messages
ORDER BY created_at DESC
LIMIT 20;
```

Messages for one group:

```sql
SELECT id, sender_id, content, status, created_at
FROM messages
WHERE group_id = 'PUT-GROUP-UUID-HERE'
ORDER BY created_at DESC
LIMIT 50;
```

Chat room members:

```sql
SELECT user_id, role, is_active, joined_at
FROM room_members
WHERE group_id = 'PUT-GROUP-UUID-HERE'
ORDER BY joined_at ASC;
```

Read receipts for one message:

```sql
SELECT user_id, seen_at
FROM read_receipts
WHERE message_id = 'PUT-MESSAGE-UUID-HERE'
ORDER BY seen_at ASC;
```

## Session Service Database

### Service Ownership

Session Service owns:

- sessions
- ratings
- verified tutor projection

Relevant files:

- [session_service/app/core/config.py](/home/pratik/project/StudySync-Microservices/session_service/app/core/config.py:1)
- [session_service/app/main.py](/home/pratik/project/StudySync-Microservices/session_service/app/main.py:1)
- [session_service/app/models/session.py](/home/pratik/project/StudySync-Microservices/session_service/app/models/session.py:1)
- [session_service/app/models/rating.py](/home/pratik/project/StudySync-Microservices/session_service/app/models/rating.py:1)
- [session_service/app/models/verified_tutor.py](/home/pratik/project/StudySync-Microservices/session_service/app/models/verified_tutor.py:1)

### Database Type

- MongoDB
- Async access through Motor
- No Alembic migrations
- Collection indexes are created at application startup

### Default Database Settings

Host-local app default:

```env
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=session_db
```

Docker container database host:

```env
MONGODB_URL=mongodb://mongo:27017
MONGODB_DB_NAME=session_db
```

### Schema Setup For Session Service

Session Service does not use Alembic.

Instead, when the app starts, it ensures indexes such as:

- `sessions_location_2dsphere`
- `sessions_status_idx`

That logic lives in [session_service/app/main.py](/home/pratik/project/StudySync-Microservices/session_service/app/main.py:1).

To initialize indexes, start the service:

```bash
docker compose up -d session_service
```

Or locally:

```bash
cd session_service
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

### Connect To MongoDB From Terminal

From your host machine:

```bash
mongosh "mongodb://localhost:27017/session_db"
```

From inside the MongoDB container:

```bash
docker exec -it studysync-mongo mongosh session_db
```

### Useful Mongo Queries

Show collections:

```javascript
show collections
```

Find recent sessions:

```javascript
db.sessions.find().sort({ scheduled_time: -1 }).limit(20)
```

Find sessions by host:

```javascript
db.sessions.find({ host_id: "PUT-HOST-UUID-HERE" })
```

Find completed sessions:

```javascript
db.sessions.find({ status: "completed" }).limit(20)
```

Find ratings for one session:

```javascript
db.ratings.find({ session_id: "PUT-SESSION-UUID-HERE" })
```

Find verified tutors:

```javascript
db.verified_tutors.find().limit(20)
```

Check indexes on sessions:

```javascript
db.sessions.getIndexes()
```

## Redis Reference

Redis is not the primary system of record for the services above, but it is part of the data layer.

Logical DB usage in this repo:

- Identity Service: `redis://localhost:6379/0`
- Session Service: `redis://localhost:6379/1`
- Group Service: `redis://localhost:6379/2`
- Chat Service: `redis://localhost:6379/3`

Connect from host:

```bash
redis-cli -h localhost -p 6379
```

Connect from container:

```bash
docker exec -it studysync-redis redis-cli
```

Select a logical DB:

```text
SELECT 3
```

List keys:

```text
KEYS *
```

## Per-Service Migration Commands Summary

### Identity Service

```bash
cd identity_service
alembic upgrade head
```

### Group Service

```bash
cd group_service
alembic upgrade head
```

### Chat Service

```bash
cd chat_service
alembic upgrade head
```

### Session Service

```bash
# No Alembic migrations
# Start the app to ensure MongoDB indexes are created
cd session_service
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

## Useful Docker Database Commands

Start only the databases:

```bash
docker compose up -d postgres postgres_group postgres_chat mongo redis
```

Check database containers:

```bash
docker compose ps
```

Inspect Postgres logs:

```bash
docker logs studysync-postgres
docker logs studysync-postgres-group
docker logs studysync-postgres-chat
```

Inspect Mongo logs:

```bash
docker logs studysync-mongo
```

## Troubleshooting

### `psql: command not found`

Install the PostgreSQL client:

```bash
sudo apt-get update
sudo apt-get install -y postgresql-client
```

### `mongosh: command not found`

Install MongoDB Shell or use the container command:

```bash
docker exec -it studysync-mongo mongosh session_db
```

### Connection refused from a Docker container

Inside Docker, do not use `localhost` for cross-container access.

Use:

- `postgres`
- `postgres_group`
- `postgres_chat`
- `mongo`
- `redis`
- `kafka`

### Alembic cannot connect

Check:

- the target database container is running
- the service `.env` file exists
- the `DATABASE_URL` value matches your runtime mode

## Recommended Workflow

1. Start the required database container.
2. Confirm the service `.env` file points to the right hostnames.
3. Run Alembic migrations for SQL services.
4. Start the corresponding service.
5. Connect with `psql` or `mongosh` to inspect data.

## Summary

StudySync uses a polyglot persistence setup:

- PostgreSQL for Identity, Group, and Chat
- MongoDB for Session
- Redis for cache, Pub/Sub, and read models

For schema changes:

- use Alembic in Identity, Group, and Chat
- use runtime index initialization in Session

For terminal inspection:

- use `psql` for PostgreSQL services
- use `mongosh` for Session Service
- use `redis-cli` for Redis-backed data and cache inspection
