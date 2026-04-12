# StudySync-Microservices

## Local stack (Docker Desktop)

From the repo root:

```bash
docker compose up -d
docker compose ps
```

This starts **PostgreSQL** (`identity_db`), **Redis**, **Zookeeper + Kafka** (broker reachable at **`localhost:9092`** from the host), and **MongoDB** (for the future Session service; Identity does not use it yet).

Default Postgres credentials (see `docker-compose.yml`): user `studysync`, password `studysync_dev`, database `identity_db`.

## Identity service (host `uvicorn`)

```bash
cd identity_service
copy .env.example .env   # Windows — or copy manually if .env is missing
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000/docs`. Set a strong `JWT_SECRET_KEY` (and optional `ADMIN_API_KEY`) in `identity_service/.env` for anything beyond local play.

If you run **Identity inside Docker** on the same Compose network later, point `DATABASE_URL` / `REDIS_URL` / `KAFKA_BOOTSTRAP_SERVERS` at service hostnames (`postgres`, `redis`, `kafka:29092`) instead of `localhost`.