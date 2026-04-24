# StudySync Microservices

StudySync is a FastAPI-based microservices project with four application services and a shared local infrastructure stack.

This guide is written for the person pulling the repo for the first time. It explains the expected environment, which `.env` files to create, which ports are used, and how to run the project with either Docker or local `uvicorn`.

## Services

| Service | Port | Purpose | Storage |
|---|---:|---|---|
| Identity Service | `8000` | auth, JWT, tutor profiles, rating aggregation | PostgreSQL + Redis |
| Session Service | `8001` | sessions, nearby search, ratings, event consumers | MongoDB + Redis |
| Group Service | `8002` | groups, membership, permissions, session proxying | PostgreSQL + Redis |
| Chat Service | `8003` | real-time study group chat, message history, Kafka chat events | PostgreSQL + Redis |

## Infrastructure

From [docker-compose.yml](/home/pratik/project/StudySync-Microservices/docker-compose.yml:1):

| Dependency | Host Port | Notes |
|---|---:|---|
| PostgreSQL `identity_db` | `5432` | used by `identity_service` |
| PostgreSQL `group_db` | `5433` | used by `group_service` |
| PostgreSQL `chat_db` | `5434` | used by `chat_service` |
| Redis | `6379` | shared Redis instance, logical DBs `0`, `1`, `2`, `3` |
| Zookeeper | `2181` | Kafka dependency |
| Kafka | `9092` | event bus |
| MongoDB | `27017` | used by `session_service` |

## Runtime Versions

- Docker services run on `python:3.12-slim`
- The codebase expects modern Python tooling and dependencies compatible with Python 3.12
- If you run services locally outside Docker, prefer Python `3.12`

## Repository Layout

- [identity_service](/home/pratik/project/StudySync-Microservices/identity_service)
- [session_service](/home/pratik/project/StudySync-Microservices/session_service)
- [group_service](/home/pratik/project/StudySync-Microservices/group_service)
- [chat_service](/home/pratik/project/StudySync-Microservices/chat_service)
- [docker-compose.yml](/home/pratik/project/StudySync-Microservices/docker-compose.yml)
- [docker-compose.dev.session.yml](/home/pratik/project/StudySync-Microservices/docker-compose.dev.session.yml)

## Quick Start

### Option 1: Run everything with Docker

This is the easiest setup for a new teammate.

1. Copy the example env files:

```bash
cp identity_service/.env.example identity_service/.env
cp session_service/.env.example session_service/.env
cp group_service/.env.example group_service/.env
cp chat_service/.env.example chat_service/.env
```

2. Make sure the JWT secret matches across all four `.env` files.

Use the same value for:

- `identity_service/.env` -> `JWT_SECRET_KEY`
- `session_service/.env` -> `JWT_SECRET_KEY`
- `group_service/.env` -> `JWT_SECRET_KEY`
- `chat_service/.env` -> `JWT_SECRET_KEY`

3. Start the full stack:

```bash
docker compose up -d --build
```

4. Open the docs:

- Identity: `http://localhost:8000/docs`
- Session: `http://localhost:8001/docs`
- Group: `http://localhost:8002/docs`
- Chat: `http://localhost:8003/docs`

### Option 2: Run infra in Docker, services locally

This is useful during development when you want hot reload with `uvicorn`.

1. Start only infrastructure:

```bash
docker compose up -d postgres postgres_group postgres_chat redis zookeeper kafka mongo
```

2. Create `.env` files from the examples:

```bash
cp identity_service/.env.example identity_service/.env
cp session_service/.env.example session_service/.env
cp group_service/.env.example group_service/.env
cp chat_service/.env.example chat_service/.env
```

3. Create one virtual environment per service and install dependencies:

```bash
cd identity_service && python3.12 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
cd group_service && python3.12 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
cd session_service && python3.12 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
cd chat_service && python3.12 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
```

4. Run migrations for SQL services:

```bash
cd identity_service && source .venv/bin/activate && alembic upgrade head
cd group_service && source .venv/bin/activate && alembic upgrade head
cd chat_service && source .venv/bin/activate && alembic upgrade head
```

5. Start the apps:

```bash
cd identity_service && source .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
cd session_service && source .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
cd group_service && source .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8002
cd chat_service && source .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8003
```

## Environment Files

Each service reads a local `.env` file from its own directory.

### Identity Service

Source of truth:
[identity_service/app/core/config.py](/home/pratik/project/StudySync-Microservices/identity_service/app/core/config.py:1)

Important variables:

- `DATABASE_URL=postgresql+asyncpg://studysync:studysync_dev@localhost:5432/identity_db`
- `REDIS_URL=redis://localhost:6379/0`
- `KAFKA_BOOTSTRAP_SERVERS=localhost:9092`
- `JWT_SECRET_KEY=<shared secret>`
- `JWT_ALGORITHM=HS256`
- `ADMIN_API_KEY=<optional>`

### Session Service

Source of truth:
[session_service/app/core/config.py](/home/pratik/project/StudySync-Microservices/session_service/app/core/config.py:1)

Important variables:

- `MONGODB_URL=mongodb://localhost:27017`
- `MONGODB_DB_NAME=session_db`
- `REDIS_URL=redis://localhost:6379/1`
- `KAFKA_BOOTSTRAP_SERVERS=localhost:9092`
- `JWT_SECRET_KEY=<shared secret>`
- `JWT_ALGORITHM=HS256`
- `AUTH_ENABLED=true|false`
- `KAFKA_ENABLED=true|false`
- `STANDALONE_MODE=true|false`
- `TEST_USER_ID=<optional>`

### Group Service

Source of truth:
[group_service/app/core/config.py](/home/pratik/project/StudySync-Microservices/group_service/app/core/config.py:1)

Important variables:

- `DATABASE_URL=postgresql+asyncpg://studysync:studysync_dev@localhost:5433/group_db`
- `REDIS_URL=redis://localhost:6379/2`
- `KAFKA_BOOTSTRAP_SERVERS=localhost:9092`
- `JWT_SECRET_KEY=<shared secret>`
- `JWT_ALGORITHM=HS256`
- `SESSION_SERVICE_URL=http://localhost:8001`

### Chat Service

Source of truth:
[chat_service/app/core/config.py](/home/pratik/project/StudySync-Microservices/chat_service/app/core/config.py:1)

Important variables:

- `DATABASE_URL=postgresql+asyncpg://studysync:studysync_dev@localhost:5434/chat_db`
- `REDIS_URL=redis://localhost:6379/3`
- `KAFKA_BOOTSTRAP_SERVERS=localhost:9092`
- `KAFKA_GROUP_EVENTS_TOPIC=GROUP_EVENTS`
- `KAFKA_CHAT_EVENTS_TOPIC=CHAT_EVENTS`
- `JWT_SECRET_KEY=<shared secret>`
- `JWT_ALGORITHM=HS256`
- `GROUP_SERVICE_URL=http://localhost:8002`

## Docker Hostnames vs Localhost

Use `localhost` when the app runs on your machine with `uvicorn`.

Use Docker service names when the app runs inside Compose.

| Dependency | Local `uvicorn` value | Docker Compose value |
|---|---|---|
| Identity Postgres | `localhost:5432` | `postgres:5432` |
| Group Postgres | `localhost:5433` | `postgres_group:5432` |
| Chat Postgres | `localhost:5434` | `postgres_chat:5432` |
| Redis | `localhost:6379` | `redis:6379` |
| Kafka | `localhost:9092` | `kafka:9092` |
| MongoDB | `localhost:27017` | `mongo:27017` |
| Session Service from Group | `http://localhost:8001` | `http://session_service:8001` |
| Group Service from Chat | `http://localhost:8002` | `http://group_service:8002` |

## Shared Assumptions

- `JWT_SECRET_KEY` must match across Identity, Session, and Group services
- `JWT_SECRET_KEY` should also match Chat Service for WebSocket/REST auth
- Identity, Group, and Chat need Alembic migrations before first local run
- Session service depends on MongoDB indexes created automatically at startup
- Redis uses logical DB separation:
  - Identity -> `/0`
  - Session -> `/1`
  - Group -> `/2`
  - Chat -> `/3`

## Common Developer Flows

### Full stack for demos

```bash
docker compose up -d --build
```

### Session-only development

Use the smaller compose file:

```bash
docker compose -f docker-compose.dev.session.yml up -d --build
```

This starts:

- MongoDB
- Redis
- Session service

The session dev env file is:
[session_service/.env.dev.session](/home/pratik/project/StudySync-Microservices/session_service/.env.dev.session:1)

In that mode:

- `STANDALONE_MODE=true`
- `KAFKA_ENABLED=false`
- `AUTH_ENABLED=false`

## Health Endpoints

- Identity: `GET /health`
- Session: `GET /health`
- Session readiness: `GET /health/ready`
- Group: `GET /health`
- Chat: `GET /health`

## Troubleshooting

### Service starts but cannot connect to Kafka

- Check that `zookeeper` and `kafka` are running
- If running locally with `uvicorn`, use `localhost:9092`
- If running inside Docker, use `kafka:9092`

### Group service cannot reach the database

- For host-local `uvicorn`, group Postgres is exposed on `5433`, not `5432`
- For Docker Compose, the internal hostname is `postgres_group:5432`

### Session service cannot connect to MongoDB

- The environment variable name is `MONGODB_URL`
- The code does not read `MONGO_URI`

### JWT-authenticated requests fail across services

- Make sure all three services use the exact same `JWT_SECRET_KEY`
- Keep `JWT_ALGORITHM=HS256` unless the code is changed consistently everywhere

## Service-Specific Docs

- [identity_service/README.md](/home/pratik/project/StudySync-Microservices/identity_service/README.md)
- [session_service/README.md](/home/pratik/project/StudySync-Microservices/session_service/README.md)
- [group_service/README.md](/home/pratik/project/StudySync-Microservices/group_service/README.md)
- [chat_service/README.md](/home/pratik/project/StudySync-Microservices/chat_service/README.md)

## Suggested First Run

If you are onboarding someone new to the repo, recommend this exact sequence:

1. Install Docker Desktop and Python 3.12
2. Copy the three `.env.example` files to `.env`
3. Set the same `JWT_SECRET_KEY` in all three `.env` files
4. Run `docker compose up -d --build`
5. Visit `/docs` on ports `8000`, `8001`, and `8002`

That path has the fewest moving parts and should be the default onboarding flow.
