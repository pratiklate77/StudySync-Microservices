# StudySync Setup Reference

This file is the project environment reference for collaborators working on the same StudySync codebase. It is meant to answer two questions quickly:

1. What configuration does the code expect?
2. What local runtime values need to stay in sync across services?

This document is based on the checked-in code and compose files in this repository. Where a value is generated at runtime, it is called out explicitly instead of being guessed.

## Source Of Truth

Primary configuration sources in this repo:

- [docker-compose.yml](/home/pratik/project/StudySync-Microservices/docker-compose.yml:1)
- [docker-compose.dev.session.yml](/home/pratik/project/StudySync-Microservices/docker-compose.dev.session.yml:1)
- [identity_service/app/core/config.py](/home/pratik/project/StudySync-Microservices/identity_service/app/core/config.py:1)
- [group_service/app/core/config.py](/home/pratik/project/StudySync-Microservices/group_service/app/core/config.py:1)
- [session_service/app/core/config.py](/home/pratik/project/StudySync-Microservices/session_service/app/core/config.py:1)
- [identity_service/.env.example](/home/pratik/project/StudySync-Microservices/identity_service/.env.example:1)
- [group_service/.env.example](/home/pratik/project/StudySync-Microservices/group_service/.env.example:1)
- [session_service/.env.example](/home/pratik/project/StudySync-Microservices/session_service/.env.example:1)
- [session_service/.env.dev.session](/home/pratik/project/StudySync-Microservices/session_service/.env.dev.session:1)

## Stack Summary

Application services:

- `identity_service` on port `8000`
- `session_service` on port `8001`
- `group_service` on port `8002`

Infrastructure:

- PostgreSQL for identity on host port `5432`
- PostgreSQL for group on host port `5433`
- Redis on host port `6379`
- Zookeeper on host port `2181`
- Kafka on host port `9092`
- MongoDB on host port `27017`

Container/runtime base:

- All three service Dockerfiles use `python:3.12-slim`

## Docker Service Names

Inside the Compose network, use these hostnames:

- Identity Postgres: `postgres`
- Group Postgres: `postgres_group`
- Redis: `redis`
- Zookeeper: `zookeeper`
- Kafka: `kafka`
- MongoDB: `mongo`
- Identity service: `identity_service`
- Session service: `session_service`
- Group service: `group_service`

## Ports And Endpoints

Host machine ports:

- Identity API: `http://localhost:8000`
- Session API: `http://localhost:8001`
- Group API: `http://localhost:8002`
- Identity docs: `http://localhost:8000/docs`
- Session docs: `http://localhost:8001/docs`
- Group docs: `http://localhost:8002/docs`
- Postgres identity: `localhost:5432`
- Postgres group: `localhost:5433`
- Redis: `localhost:6379`
- Kafka: `localhost:9092`
- MongoDB: `localhost:27017`
- Zookeeper: `localhost:2181`

Health endpoints:

- Identity: `GET /health`
- Session: `GET /health`
- Session readiness: `GET /health/ready`
- Group: `GET /health`

## Required Local Files

Each service expects its own `.env` file:

- `identity_service/.env`
- `group_service/.env`
- `session_service/.env`

Bootstrap them from:

- `identity_service/.env.example`
- `group_service/.env.example`
- `session_service/.env.example`

Session standalone/dev mode uses:

- `session_service/.env.dev.session`

## Shared Values That Must Stay In Sync

These are the most important cross-service settings:

- `JWT_SECRET_KEY`
  - Must be the same in `identity_service`, `session_service`, and `group_service`
- `JWT_ALGORITHM`
  - Expected to be `HS256` across the services
- Kafka topic names
  - `USER_EVENTS`
  - `RATING_EVENTS`
  - `PAYMENT_EVENTS`
  - `GROUP_EVENTS`
- Kafka bootstrap server
  - `localhost:9092` for host-local app runs
  - `kafka:9092` for apps running inside the Compose network used by the current checked-in `docker-compose.yml`

## Service Configuration Matrix

### Identity Service

Role:

- authentication
- JWT issuance
- tutor profiles
- rating aggregation

Default environment:

- `DATABASE_URL=postgresql+asyncpg://studysync:studysync_dev@localhost:5432/identity_db`
- `REDIS_URL=redis://localhost:6379/0`
- `KAFKA_BOOTSTRAP_SERVERS=localhost:9092`
- `KAFKA_CLIENT_ID=identity-service`
- `KAFKA_USER_EVENTS_TOPIC=USER_EVENTS`
- `KAFKA_RATING_EVENTS_TOPIC=RATING_EVENTS`
- `KAFKA_CONSUMER_GROUP=identity-service-ratings`
- `KAFKA_SEND_TIMEOUT_SECONDS=5.0`
- `KAFKA_STARTUP_TIMEOUT_SECONDS=10.0`
- `KAFKA_STARTUP_MAX_RETRIES=5`
- `KAFKA_STARTUP_RETRY_DELAY_SECONDS=3.0`
- `KAFKA_CIRCUIT_BREAKER_FAILURE_THRESHOLD=3`
- `KAFKA_CIRCUIT_BREAKER_RECOVERY_TIMEOUT_SECONDS=30.0`
- `KAFKA_RETRY_BASE_DELAY_SECONDS=2.0`
- `KAFKA_RETRY_MAX_DELAY_SECONDS=30.0`
- `JWT_SECRET_KEY=<must match all services>`
- `JWT_ALGORITHM=HS256`
- `JWT_ACCESS_TOKEN_EXPIRE_MINUTES=1440`
- `TOP_TUTORS_CACHE_KEY=marketplace:top_tutors`
- `TOP_TUTORS_CACHE_TTL_SECONDS=300`
- `ADMIN_API_KEY=<optional>`

Storage:

- PostgreSQL database: `identity_db`
- Redis logical DB: `0`

### Group Service

Role:

- study groups
- memberships
- role-based moderation
- session-service proxy calls

Default environment:

- `DATABASE_URL=postgresql+asyncpg://studysync:studysync_dev@localhost:5433/group_db`
- `REDIS_URL=redis://localhost:6379/2`
- `KAFKA_BOOTSTRAP_SERVERS=localhost:9092`
- `KAFKA_CLIENT_ID=group-service`
- `KAFKA_GROUP_EVENTS_TOPIC=GROUP_EVENTS`
- `JWT_SECRET_KEY=<must match all services>`
- `JWT_ALGORITHM=HS256`
- `SESSION_SERVICE_URL=http://localhost:8001`
- `SESSION_SERVICE_TIMEOUT_SECONDS=5.0`

Storage:

- PostgreSQL database: `group_db`
- Redis logical DB: `2`

### Session Service

Role:

- sessions
- nearby search
- ratings
- event consumers
- standalone development mode

Default environment:

- `AUTH_ENABLED=true`
- `KAFKA_ENABLED=true`
- `STANDALONE_MODE=false`
- `TEST_USER_ID=<optional>`
- `MONGODB_URL=mongodb://localhost:27017`
- `MONGODB_DB_NAME=session_db`
- `REDIS_URL=redis://localhost:6379/1`
- `KAFKA_BOOTSTRAP_SERVERS=localhost:9092`
- `KAFKA_CLIENT_ID=session-service`
- `KAFKA_PAYMENT_EVENTS_TOPIC=PAYMENT_EVENTS`
- `KAFKA_USER_EVENTS_TOPIC=USER_EVENTS`
- `KAFKA_RATING_EVENTS_TOPIC=RATING_EVENTS`
- `KAFKA_CONSUMER_GROUP=session-service-group`
- `JWT_SECRET_KEY=<must match all services>`
- `JWT_ALGORITHM=HS256`
- `NEARBY_SESSIONS_CACHE_TTL_SECONDS=60`

Storage:

- MongoDB database: `session_db`
- Redis logical DB: `1`

## Localhost vs Docker Values

Use `localhost` when running the FastAPI app directly with `uvicorn` on your machine.

Use Docker service names when the app itself runs inside Compose.

| Dependency | Host-local app value | Docker app value |
|---|---|---|
| Identity Postgres | `localhost:5432` | `postgres:5432` |
| Group Postgres | `localhost:5433` | `postgres_group:5432` |
| Redis | `localhost:6379` | `redis:6379` |
| Kafka | `localhost:9092` | `kafka:9092` |
| MongoDB | `localhost:27017` | `mongo:27017` |
| Session API from Group | `http://localhost:8001` | `http://session_service:8001` |

## Docker Compose Environment

Current checked-in `docker-compose.yml` starts:

- `postgres`
- `postgres_group`
- `redis`
- `zookeeper`
- `kafka`
- `mongo`
- `identity_service`
- `session_service`
- `group_service`

Named Docker volumes:

- `postgres_data`
- `postgres_group_data`
- `redis_data`
- `zookeeper_data`
- `kafka_data`
- `mongo_data`

Network:

- `studysync`

## Session Dev-Only Compose

`docker-compose.dev.session.yml` starts only:

- `mongo`
- `redis`
- `session_service`

Network:

- `studysync-dev`

Volumes:

- `mongo_data_dev`
- `redis_data_dev`

Standalone session mode values from `.env.dev.session`:

- `STANDALONE_MODE=true`
- `KAFKA_ENABLED=false`
- `AUTH_ENABLED=false`
- `TEST_USER_ID=550e8400-e29b-41d4-a716-446655440000`
- `MONGODB_URL=mongodb://mongo:27017`
- `REDIS_URL=redis://redis:6379/1`

## Kafka Reference

Static Kafka config from `docker-compose.yml`:

- Image: `confluentinc/cp-kafka:7.5.0`
- Broker service name: `kafka`
- Broker container name: `studysync-kafka`
- Broker ID: `1`
- Zookeeper connect: `zookeeper:2181`
- Listener: `PLAINTEXT://0.0.0.0:9092`
- Advertised listener: `PLAINTEXT://kafka:9092`
- Offsets topic replication factor: `1`
- Transaction state log replication factor: `1`
- Transaction state log min ISR: `1`
- Group initial rebalance delay: `0`
- Heap opts: `-Xms256m -Xmx256m`

Topics referenced by code:

- `USER_EVENTS`
- `RATING_EVENTS`
- `PAYMENT_EVENTS`
- `GROUP_EVENTS`

Consumer groups referenced by code:

- Identity: `identity-service-ratings`
- Session: `session-service-group`

## Kafka Cluster ID

The Kafka cluster ID is not hardcoded anywhere in this repository. It is created by Kafka at runtime and stored in Kafka metadata.

That means:

- it should not be guessed or committed as a static source-of-truth value
- it may change if Kafka data is recreated
- it is only accurate when read from the running broker or persisted Kafka volume

Ways to retrieve it from a running environment:

```bash
docker exec studysync-kafka bash -lc "grep '^cluster.id=' /var/lib/kafka/data/meta.properties"
```

Or, if the Kafka CLI is available in the container:

```bash
docker exec studysync-kafka kafka-cluster cluster-id --bootstrap-server kafka:9092
```

Record the current live value here only when you intentionally want to snapshot a specific machine or compose state:

- Current Kafka cluster ID: `<runtime-generated; fill from running environment if needed>`

## Database Reference

Identity Postgres:

- database: `identity_db`
- username: `studysync`
- password: `studysync_dev`
- host-local port: `5432`
- Docker hostname: `postgres`

Group Postgres:

- database: `group_db`
- username: `studysync`
- password: `studysync_dev`
- host-local port: `5433`
- Docker hostname: `postgres_group`

MongoDB:

- database: `session_db`
- host-local port: `27017`
- Docker hostname: `mongo`

Redis:

- host-local port: `6379`
- Docker hostname: `redis`
- logical DBs:
  - Identity: `0`
  - Session: `1`
  - Group: `2`

## Startup Modes

### Full Project In Docker

```bash
cp identity_service/.env.example identity_service/.env
cp group_service/.env.example group_service/.env
cp session_service/.env.example session_service/.env
docker compose up -d --build
```

### Infra In Docker, Apps Local

```bash
docker compose up -d postgres postgres_group redis zookeeper kafka mongo
```

Then run each service locally with its own virtual environment and `.env`.

### Session-Only Local Dev

```bash
docker compose -f docker-compose.dev.session.yml up -d --build
```

## Verification Checklist

Before telling another collaborator "the setup is synced", verify these:

- all three `.env` files exist
- `JWT_SECRET_KEY` is identical across identity, session, and group
- group service points to `localhost:5433` when run outside Docker
- session service uses `MONGODB_URL`, not `MONGO_URI`
- `SESSION_SERVICE_URL` matches the actual runtime mode
- Kafka bootstrap server matches the runtime mode
- Postgres migrations were run for identity and group
- the Docker services are healthy if using Compose

## Things This File Intentionally Does Not Hardcode

These values are environment-specific or secret and should not be committed as real shared values unless you intentionally want to snapshot one machine:

- real `JWT_SECRET_KEY`
- real `ADMIN_API_KEY`
- runtime Kafka cluster ID
- any host-specific absolute file paths
- any personal machine usernames, IP addresses, or shell aliases

If you want to keep a private machine snapshot, create a non-committed companion file such as `setup.local.md` or store those values in your local `.env` files.
