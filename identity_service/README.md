# Identity & Profile Service — StudySync

## 1. Service Overview

The Identity & Profile Service is the **authentication and user management backbone** of the StudySync platform. Every user interaction — from signing up to becoming a verified tutor — flows through this service.

It owns two core domains:
- **Authentication:** Registration, login, and JWT issuance
- **Tutor Profiles:** Onboarding, admin verification, rating aggregation, and leaderboard

This service is the **single source of truth** for who a user is and what role they hold. No other service stores credentials or issues tokens.

---

## 2. Responsibilities

### What it handles
- User registration and login (email + bcrypt password)
- JWT access token issuance and validation
- Tutor profile creation (`/tutors/become`)
- Admin-gated tutor verification (`/tutors/{user_id}/verify`)
- Aggregating tutor ratings received from Kafka (`RATING_EVENTS`)
- Serving the tutor leaderboard with Redis caching
- Publishing `TUTOR_VERIFIED` events to Kafka (`USER_EVENTS` topic)

### What it does NOT handle
- Session creation or booking (→ Session & Booking Service)
- Payments or financial ledgers (→ Payment & Ledger Service)
- Geospatial queries (→ Session Service via MongoDB `$near`)
- Token refresh or revocation (not yet implemented)
- Email verification or OAuth

---

## 3. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     StudySync Platform                      │
│                                                             │
│  ┌──────────────┐    USER_EVENTS     ┌───────────────────┐  │
│  │   Identity   │ ─────────────────► │  Session Service  │  │
│  │   Service    │                    │  (MongoDB)        │  │
│  │  (Postgres)  │ ◄───────────────── │                   │  │
│  │  (Redis)     │    RATING_EVENTS   └───────────────────┘  │
│  └──────┬───────┘                                           │
│         │                            ┌───────────────────┐  │
│         │         USER_EVENTS        │  Payment Service  │  │
│         └───────────────────────────►│  (Postgres)       │  │
│                                      └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

The Identity Service sits at the **entry point** of the platform. Other services consume its events but never call it directly — all inter-service communication is async via Kafka.

---

## 4. Detailed Backend Workflows

### 4.1 User Registration

```
Client
  │
  ▼
POST /api/v1/auth/register  {email, password}
  │
  ▼
AuthService.register()
  ├── Normalise email to lowercase
  ├── hash_password(password)  →  bcrypt hash
  ├── UserRepository.create()  →  INSERT INTO users
  │     └── session.flush()    →  gets DB-assigned UUID
  ├── session.commit()
  └── Return UserRead (id, email, role, is_active, created_at)
  │
  ▼
HTTP 201 Created
```

**Key detail:** `IntegrityError` on duplicate email is caught and converted to `HTTP 409 Conflict`. The session is explicitly rolled back before re-raising.

---

### 4.2 User Login

```
Client
  │
  ▼
POST /api/v1/auth/login  {email, password}
  │
  ▼
AuthService.login()
  ├── UserRepository.get_by_email(email.lower())
  ├── Guard: user must exist AND is_active == True
  ├── verify_password(plain, hash)  →  bcrypt.verify
  ├── create_access_token(user.id)
  │     └── JWT payload: {sub: user_id, exp: now+1440min, type: "access"}
  │     └── Signed with HS256 + JWT_SECRET_KEY
  └── Return Token {access_token, token_type: "bearer"}
  │
  ▼
HTTP 200 OK
```

**Key detail:** Both "user not found" and "wrong password" return the same `401` message (`"Incorrect email or password"`) to prevent user enumeration.

---

### 4.3 Authenticated Request (JWT Guard)

```
Client  →  Authorization: Bearer <token>
  │
  ▼
deps.get_current_user()
  ├── HTTPBearer extracts token from header
  ├── decode_access_token(token)
  │     └── jwt.decode() with HS256 — raises on expiry/bad sig
  ├── Extract sub (user UUID) from payload
  ├── UserRepository.get_by_id(user_id)
  └── Guard: user must exist AND is_active == True
  │
  ▼
User ORM object injected into endpoint handler
```

---

### 4.4 Become a Tutor

```
Client  →  POST /api/v1/tutors/become  {bio, expertise[], hourly_rate}
  │         Authorization: Bearer <token>
  │
  ▼
get_current_user()  →  authenticated User object
  │
  ▼
TutorService.become_tutor()
  ├── Guard: user.is_active == True
  ├── TutorRepository.get_by_user_id()  →  must return None (no duplicate)
  ├── Quantize hourly_rate to 2 decimal places (ROUND_HALF_UP)
  ├── TutorRepository.create()  →  INSERT INTO tutor_profiles
  ├── UserRepository.set_role(user, UserRole.tutor)  →  UPDATE users SET role='tutor'
  ├── session.commit()  →  both writes committed atomically
  └── Return TutorProfileRead
  │
  ▼
HTTP 201 Created
```

**Key detail:** The role upgrade (`users.role = 'tutor'`) and profile creation happen in the **same DB transaction**. If either fails, both roll back.

---

### 4.5 Admin Tutor Verification

```
Admin Client  →  POST /api/v1/tutors/{user_id}/verify
                 X-Admin-API-Key: <key>
  │
  ▼
verify_tutor_admin()
  ├── Guard: ADMIN_API_KEY must be configured (else 503)
  ├── secrets.compare_digest(provided, expected)  →  timing-safe compare
  │     └── Length check first to prevent short-circuit timing leak
  │
  ▼
TutorService.verify_tutor()
  ├── TutorRepository.get_by_user_id(user_id)  →  must exist (else 404)
  ├── Guard: if already verified → return early (idempotent)
  ├── TutorRepository.set_verified(profile, True)
  ├── session.commit()
  ├── publish_tutor_verified(producer, user_id)
  │     └── Kafka: USER_EVENTS topic, key=user_id, payload={event_type: TUTOR_VERIFIED, user_id}
  └── cache.invalidate()  →  Redis DEL marketplace:top_tutors
  │
  ▼
HTTP 200  TutorProfileRead
```

---

### 4.6 Rating Event Consumer (Background Task)

```
Session Service
  └── Publishes to Kafka: RATING_EVENTS
        payload: {event_type: "RATING_SUBMITTED", tutor_id: <uuid>, score: <1-5>}
  │
  ▼
RatingEventsConsumer._run_loop()  (asyncio background task)
  ├── Filter: event_type must be "RATING_SUBMITTED"
  ├── Validate: tutor_id is valid UUID, score in [1, 5]
  ├── Open new AsyncSession from session_factory
  ├── TutorService.apply_rating_from_event()
  │     └── TutorRepository.increment_rating()
  │           └── UPDATE tutor_profiles
  │               SET rating_sum = rating_sum + score,
  │                   total_reviews = total_reviews + 1
  │               WHERE user_id = ? AND is_active = true
  ├── session.commit()
  └── cache.invalidate()  →  Redis DEL marketplace:top_tutors
```

**Key detail:** Each message gets its own `AsyncSession` opened from the factory. Errors per-message are caught and logged without crashing the consumer loop.

---

### 4.7 Tutor Leaderboard (Cache-Aside Pattern)

```
Client  →  GET /api/v1/tutors/leaderboard?limit=20
  │
  ▼
TutorService.leaderboard()
  │
  ├── cache.get_cached_payload()
  │     └── Redis GET marketplace:top_tutors
  │
  ├── [CACHE HIT]
  │     └── Deserialize JSON → list[TutorProfileRead]  →  return
  │
  └── [CACHE MISS]
        ├── TutorRepository.list_top_candidates(limit)
        │     └── SELECT * FROM tutor_profiles
        │         WHERE is_active=true AND is_verified=true
        │         ORDER BY (rating_sum / NULLIF(total_reviews,0)) DESC,
        │                   total_reviews DESC
        │         LIMIT ?
        ├── Serialize to JSON
        ├── Redis SETEX marketplace:top_tutors 300 <json>
        └── Return list[TutorProfileRead]
```

---

## 5. Data Flow

```
                    ┌──────────────────────────────────────────┐
                    │           Identity Service               │
                    │                                          │
HTTP Request        │  FastAPI Router                          │
──────────────►     │      │                                   │
                    │      ▼                                   │
                    │  Pydantic Schema (validate + parse)      │
                    │      │                                   │
                    │      ▼                                   │
                    │  Service Layer (business logic)          │
                    │      │              │                    │
                    │      ▼              ▼                    │
                    │  Repository    TopTutorsCacheService     │
                    │  (SQLAlchemy)  (Redis GET/SETEX/DEL)     │
                    │      │                                   │
                    │      ▼                                   │
                    │  PostgreSQL (identity_db)                │
                    │                                          │
                    │  KafkaProducer ──► USER_EVENTS topic     │
                    │  KafkaConsumer ◄── RATING_EVENTS topic   │
                    └──────────────────────────────────────────┘
```

**Inbound:** HTTP → Router → Schema validation → Service → Repository → Postgres  
**Outbound events:** Service → KafkaProducer → `USER_EVENTS`  
**Inbound events:** `RATING_EVENTS` → KafkaConsumer (background task) → Service → Repository → Postgres → Redis invalidation

---

## 6. API Documentation

Base path: `/api/v1`

### Auth Endpoints

#### `POST /auth/register`
Register a new user account.

**Request**
```json
{
  "email": "alice@example.com",
  "password": "securepass123"
}
```

**Response `201`**
```json
{
  "id": "a1b2c3d4-...",
  "email": "alice@example.com",
  "role": "user",
  "is_active": true,
  "last_known_latitude": null,
  "last_known_longitude": null,
  "created_at": "2024-01-15T10:30:00Z"
}
```

| Status | Meaning |
|--------|---------|
| 201 | User created |
| 409 | Email already registered |
| 422 | Validation error (bad email, password < 8 chars) |

---

#### `POST /auth/login`
Authenticate and receive a JWT.

**Request**
```json
{
  "email": "alice@example.com",
  "password": "securepass123"
}
```

**Response `200`**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

| Status | Meaning |
|--------|---------|
| 200 | Login successful |
| 401 | Incorrect email or password |

---

### Tutor Endpoints

#### `POST /tutors/become`
Upgrade the authenticated user to a tutor. Requires `Authorization: Bearer <token>`.

**Request**
```json
{
  "bio": "Math tutor with 5 years experience",
  "expertise": ["Calculus", "Linear Algebra"],
  "hourly_rate": "45.00"
}
```

**Response `201`**
```json
{
  "id": "b2c3d4e5-...",
  "user_id": "a1b2c3d4-...",
  "bio": "Math tutor with 5 years experience",
  "expertise": ["Calculus", "Linear Algebra"],
  "hourly_rate": "45.00",
  "rating_sum": 0,
  "total_reviews": 0,
  "is_verified": false
}
```

| Status | Meaning |
|--------|---------|
| 201 | Tutor profile created |
| 401 | Missing or invalid JWT |
| 403 | User account is inactive |
| 409 | User already has a tutor profile |

---

#### `GET /tutors/leaderboard?limit=20`
Returns top verified tutors ranked by average rating.

**Response `200`**
```json
[
  {
    "id": "b2c3d4e5-...",
    "user_id": "a1b2c3d4-...",
    "bio": "...",
    "expertise": ["Calculus"],
    "hourly_rate": "45.00",
    "rating_sum": 230,
    "total_reviews": 50,
    "is_verified": true
  }
]
```

| Status | Meaning |
|--------|---------|
| 200 | Success (may be served from Redis cache) |
| 422 | `limit` out of range (must be 1–50) |

---

#### `POST /tutors/{user_id}/verify`
Admin-only. Verifies a tutor profile and emits `TUTOR_VERIFIED` to Kafka.

**Headers:** `X-Admin-API-Key: <admin_api_key>`

**Response `200`** — same shape as `TutorProfileRead` with `is_verified: true`

| Status | Meaning |
|--------|---------|
| 200 | Verified (idempotent — safe to call twice) |
| 403 | Invalid or missing admin key |
| 404 | No tutor profile for that user_id |
| 503 | `ADMIN_API_KEY` not configured |

---

#### `GET /health`
Liveness probe.

**Response `200`**
```json
{ "status": "ok" }
```

---

## 7. Database Design

Database: **PostgreSQL 16** (`identity_db`)  
ORM: **SQLAlchemy 2.0 async** | Migrations: **Alembic**

### `users` table

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | PK, default `uuid4` | Stable identifier across services |
| `email` | `VARCHAR(320)` | UNIQUE, NOT NULL, indexed | Lowercased on write |
| `password_hash` | `VARCHAR(255)` | NOT NULL | bcrypt hash, never stored plain |
| `role` | `VARCHAR(20)` | NOT NULL, default `'user'` | `'user'` or `'tutor'` |
| `is_active` | `BOOLEAN` | NOT NULL, default `true` | Soft-delete flag |
| `last_known_latitude` | `FLOAT` | nullable | Set by frontend for geo features |
| `last_known_longitude` | `FLOAT` | nullable | Set by frontend for geo features |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, server default `now()` | UTC |

### `tutor_profiles` table

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | PK, default `uuid4` | |
| `user_id` | `UUID` | UNIQUE, FK → `users.id` ON DELETE CASCADE, indexed | One profile per user |
| `bio` | `TEXT` | nullable | Up to 2000 chars enforced at schema layer |
| `expertise` | `VARCHAR(128)[]` | NOT NULL | PostgreSQL native array, up to 50 tags |
| `hourly_rate` | `NUMERIC(12,2)` | NOT NULL, default `0` | Stored as exact decimal |
| `rating_sum` | `INTEGER` | NOT NULL, default `0` | Cumulative sum of all scores |
| `total_reviews` | `INTEGER` | NOT NULL, default `0` | Count of reviews received |
| `is_verified` | `BOOLEAN` | NOT NULL, default `false` | Set by admin only |
| `is_active` | `BOOLEAN` | NOT NULL, default `true` | Soft-delete flag |

**Average rating** is computed on-the-fly as `rating_sum / NULLIF(total_reviews, 0)` — never stored, always consistent.

**Relationship:** `users` ←1:1→ `tutor_profiles` (a user may or may not have a profile)

---

## 8. Event & Messaging Integration

Message broker: **Apache Kafka** (via `aiokafka`)  
Kafka runs at `localhost:9092` (host) / `kafka:29092` (Docker network)

### Topics

| Topic | Direction | Event Type | Payload |
|-------|-----------|------------|---------|
| `USER_EVENTS` | **Producer** | `TUTOR_VERIFIED` | `{event_type, user_id}` |
| `RATING_EVENTS` | **Consumer** | `RATING_SUBMITTED` | `{event_type, tutor_id, score}` |

---

### Producer: `TUTOR_VERIFIED`

Triggered by `POST /tutors/{user_id}/verify` after DB commit.

```python
# kafka_producer.py
payload = {
    "event_type": "TUTOR_VERIFIED",
    "user_id": str(user_id),
}
await producer.send_and_wait(
    settings.kafka_user_events_topic,   # "USER_EVENTS"
    value=payload,
    key=str(user_id).encode("utf-8"),   # keyed by user_id for partition ordering
)
```

`send_and_wait` blocks until the broker acknowledges — guarantees the event is durable before the HTTP response is returned.

**Consumer (downstream):** Session Service listens on `USER_EVENTS` and caches verified tutor IDs in Redis to gate paid session creation.

---

### Consumer: `RATING_SUBMITTED`

Runs as an `asyncio` background task started during FastAPI `lifespan`.

```
RATING_EVENTS topic
  └── {event_type: "RATING_SUBMITTED", tutor_id: "<uuid>", score: 4}
        │
        ▼
RatingEventsConsumer._run_loop()
  ├── Validate event_type, tutor_id (UUID parse), score (1–5)
  ├── Open fresh AsyncSession
  ├── UPDATE tutor_profiles SET rating_sum+=score, total_reviews+=1
  ├── session.commit()
  └── Redis DEL marketplace:top_tutors  (cache invalidation)
```

**Consumer group:** `identity-service-ratings`  
**Auto-commit:** enabled — offset advances after each message is processed  
**Error handling:** per-message `try/except` logs and skips bad messages without stopping the loop

---

## 9. Caching Strategy

Cache: **Redis 7** (via `redis.asyncio` with `hiredis` parser)  
Pattern: **Cache-Aside (Lazy Loading)**

### Top Tutors Cache

| Property | Value |
|----------|-------|
| Key | `marketplace:top_tutors` |
| TTL | 300 seconds (5 minutes) |
| Serialization | JSON string |
| Set operation | `SETEX` |
| Invalidation | `DEL` on tutor verification or new rating |

**Read path:**
```
GET marketplace:top_tutors
  ├── HIT  → deserialize JSON → return immediately (no DB query)
  └── MISS → query Postgres → serialize → SETEX with TTL → return
```

**Write path (invalidation):**  
Two events trigger `DEL marketplace:top_tutors`:
1. A tutor is verified (new entrant to leaderboard)
2. A `RATING_SUBMITTED` event updates a tutor's score

**Why invalidation over update?** The leaderboard ranking changes when any score changes. Recomputing and re-serializing the full list on every rating event would be expensive. It's cheaper to invalidate and let the next read rebuild it.

**Resilience:** Redis failures are caught and logged. The service degrades gracefully — cache misses fall through to Postgres, and failed invalidations are non-fatal.

---

## 10. Security Design

### Password Storage
- Hashed with **bcrypt** (via `passlib`) — adaptive cost factor, salted automatically
- Plain-text password never logged, stored, or returned in any response

### JWT Tokens
- Algorithm: **HS256** with `JWT_SECRET_KEY` (min 32 bytes recommended)
- Payload: `{sub: user_uuid, exp: unix_timestamp, type: "access"}`
- Expiry: 1440 minutes (24 hours) — configurable via `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`
- Validated on every protected request via `deps.get_current_user()`

### Admin API Key
- Passed as `X-Admin-API-Key` header
- Compared using `secrets.compare_digest()` — **constant-time comparison** to prevent timing attacks
- Length check performed before digest comparison to avoid short-circuit leaks
- Returns `503` if `ADMIN_API_KEY` is not configured (fail-closed)

### User Enumeration Prevention
- Login returns identical `401` for both "user not found" and "wrong password"
- No timing difference between the two paths (both hit the DB)

### Input Validation
- All inputs validated by **Pydantic v2** before reaching service layer
- Email normalised to lowercase on write
- `expertise` tags capped at 50 items, each truncated to 128 chars at the API layer
- `hourly_rate` validated as non-negative decimal

### Transport
- HTTPS should be terminated at the load balancer / reverse proxy in production
- Service itself runs plain HTTP internally (standard for containerised microservices)

---

## 11. Error Handling Strategy

### HTTP Error Mapping

| Scenario | HTTP Status | Detail |
|----------|-------------|--------|
| Duplicate email on register | 409 | `"Email already registered"` |
| Wrong credentials on login | 401 | `"Incorrect email or password"` |
| Invalid / expired JWT | 401 | `"Could not validate credentials"` |
| Inactive user | 401 | `"Could not validate credentials"` |
| Inactive user tries to become tutor | 403 | `"Inactive user"` |
| Already has tutor profile | 409 | `"User already has a tutor profile"` |
| Tutor profile not found | 404 | `"Tutor profile not found"` |
| Invalid admin key | 403 | `"Invalid admin credentials"` |
| Admin key not configured | 503 | `"Admin verification is not configured"` |
| Kafka producer unavailable | 503 | `"Kafka producer is not available"` |
| `limit` out of range | 422 | FastAPI validation detail |

### Database Errors
- `IntegrityError` (duplicate email) is caught in `AuthService.register()`, session is rolled back, and a clean `409` is raised
- All other DB errors propagate as unhandled exceptions → FastAPI returns `500`

### Kafka Consumer Errors
- Per-message `try/except` in `_run_loop()` — bad messages are logged and skipped
- Consumer loop itself only exits on `CancelledError` (graceful shutdown)
- Invalid UUIDs and out-of-range scores are rejected silently with a `False` return

### Redis Errors
- `get_cached_payload()` catches all exceptions and returns `None` (cache miss fallback)
- `invalidate()` catches all exceptions and logs — never raises to caller

---

## 12. Project Structure

```
identity_service/
├── app/
│   ├── main.py                  # FastAPI app factory, lifespan (startup/shutdown)
│   ├── core/
│   │   ├── config.py            # Pydantic Settings — reads from .env
│   │   ├── database.py          # Async SQLAlchemy engine + session factory
│   │   ├── redis_client.py      # Redis connection factory
│   │   └── security.py          # bcrypt hashing, JWT encode/decode
│   ├── models/
│   │   ├── base.py              # SQLAlchemy DeclarativeBase
│   │   ├── user.py              # User ORM model + UserRole enum
│   │   └── tutor_profile.py     # TutorProfile ORM model
│   ├── schemas/
│   │   ├── auth.py              # UserRegister, UserLogin, UserRead, Token
│   │   └── tutor.py             # TutorBecome, TutorProfileRead
│   ├── api/
│   │   └── v1/
│   │       ├── __init__.py      # APIRouter aggregator
│   │       ├── auth.py          # /auth/register, /auth/login endpoints
│   │       ├── tutors.py        # /tutors/become, /leaderboard, /verify endpoints
│   │       └── deps.py          # get_current_user dependency
│   ├── services/
│   │   ├── auth_service.py      # Registration + login business logic
│   │   ├── tutor_service.py     # Become tutor, verify, leaderboard, rating apply
│   │   └── top_tutors_cache.py  # Redis cache wrapper for leaderboard
│   ├── repositories/
│   │   ├── user_repository.py   # User CRUD (get_by_id, get_by_email, create, set_role)
│   │   └── tutor_repository.py  # TutorProfile CRUD + increment_rating + list_top
│   └── events/
│       ├── kafka_producer.py    # AIOKafkaProducer factory + publish_tutor_verified
│       └── kafka_consumer.py    # RatingEventsConsumer background task
├── alembic/
│   ├── env.py                   # Alembic async env config
│   ├── script.py.mako           # Migration template
│   └── versions/
│       └── 001_initial_identity_tables.py
├── .env.example                 # Template — copy to .env before running
├── alembic.ini
├── Dockerfile
└── requirements.txt
```

**Layer responsibilities:**
- `api/` — HTTP boundary: parse request, call service, return response. No business logic.
- `services/` — Business logic and orchestration. No direct DB calls.
- `repositories/` — All SQL. No business logic.
- `events/` — Kafka I/O only. Delegates processing to services.
- `core/` — Infrastructure wiring (DB, Redis, JWT, config). No domain logic.

---

## 13. Deployment Instructions

### Prerequisites
- Docker Desktop (or Docker Engine + Compose plugin)
- Python 3.12+ (for host-based development)

### Option A — Full Docker Stack

```bash
# From repo root
docker compose up -d

# Verify all containers are healthy
docker compose ps

# Run migrations inside the identity container
docker compose exec identity_service alembic upgrade head

# Tail logs
docker compose logs -f identity_service
```

Service is available at `http://localhost:8000/docs`

---

### Option B — Host uvicorn + Docker data stack

```bash
# 1. Start only the data services
docker compose up -d postgres redis zookeeper kafka

# 2. Set up the Python environment
cd identity_service
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# 3. Configure environment
cp .env.example .env
# Edit .env — set a real JWT_SECRET_KEY:
#   openssl rand -hex 32

# 4. Install dependencies
pip install -r requirements.txt

# 5. Run migrations
alembic upgrade head

# 6. Start the service
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000/docs` for the interactive Swagger UI.

---

### Environment Variables

| Variable | Default | Required | Notes |
|----------|---------|----------|-------|
| `DATABASE_URL` | `postgresql+asyncpg://studysync:studysync_dev@localhost:5432/identity_db` | Yes | Use `postgres` hostname inside Docker |
| `REDIS_URL` | `redis://localhost:6379/0` | Yes | Use `redis` hostname inside Docker |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` | Yes | Use `kafka:29092` inside Docker |
| `JWT_SECRET_KEY` | `change-me-...` | Yes | Generate with `openssl rand -hex 32` |
| `JWT_ALGORITHM` | `HS256` | No | |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | No | 24 hours |
| `ADMIN_API_KEY` | _(empty)_ | No | Required to enable `/tutors/{id}/verify` |
| `TOP_TUTORS_CACHE_KEY` | `marketplace:top_tutors` | No | |
| `TOP_TUTORS_CACHE_TTL_SECONDS` | `300` | No | |

---

## 14. Design Decisions

### Why FastAPI?
Fully async from the ground up. `async def` endpoints, async SQLAlchemy, async Redis, and async Kafka consumers all run on the same event loop without blocking. This is critical for a service that handles both HTTP requests and background Kafka consumption simultaneously.

### Why PostgreSQL for Identity?
User credentials and tutor profiles are **relational, strongly consistent data**. The 1:1 relationship between `users` and `tutor_profiles`, the unique constraint on email, and the need for ACID transactions on role upgrades all point to a relational database. PostgreSQL's native `ARRAY` type also handles the `expertise` tags cleanly without a join table.

### Why `rating_sum + total_reviews` instead of storing average?
Storing a running sum and count allows **atomic increments** (`UPDATE ... SET rating_sum = rating_sum + score`) without read-modify-write races. The average is derived at query time. Storing a pre-computed average would require a read before every update.

### Why Cache-Aside (not Write-Through) for leaderboard?
The leaderboard is read-heavy but the ranking changes on every rating event. Write-through would update the cache on every Kafka message, which is wasteful if no one reads the leaderboard between events. Cache-aside with TTL-based expiry and explicit invalidation on meaningful changes (verification, new rating) is a better fit.

### Why `send_and_wait` for Kafka producer?
`send_and_wait` ensures the broker has acknowledged the message before the HTTP response is returned. This prevents the scenario where the admin gets a `200 OK` but the `TUTOR_VERIFIED` event was never actually delivered.

### Why `secrets.compare_digest` for admin key?
String equality (`==`) short-circuits on the first differing character, leaking timing information that can be used to brute-force the key one character at a time. `compare_digest` always takes the same time regardless of where the strings differ.

### Why `lru_cache` on `get_settings()`?
`Settings()` reads and parses the `.env` file. Calling it on every request would be wasteful. `lru_cache` makes it a singleton — parsed once at first call, reused forever.

### Why separate `Repository` and `Service` layers?
- Repositories are pure DB I/O — easy to unit test with a real or in-memory DB
- Services contain business logic — testable by mocking the repository
- This separation means business rules never leak into SQL and SQL never leaks into business logic

---

## 15. Scalability Considerations

### Horizontal Scaling
The service is **stateless** — all state lives in Postgres, Redis, and Kafka. Multiple instances can run behind a load balancer without coordination.

**Kafka consumer group:** All instances share `identity-service-ratings` consumer group. Kafka distributes `RATING_EVENTS` partitions across instances — each message is processed by exactly one instance.

### Database
- `email` column has a B-tree index for O(log n) login lookups
- `tutor_profiles.user_id` has a unique index for O(log n) profile lookups
- The leaderboard query (`ORDER BY avg_rating DESC`) benefits from the Redis cache — Postgres only runs this query on cache miss

### Redis
- Single Redis instance is sufficient for this workload
- For higher availability: Redis Sentinel or Redis Cluster
- Cache key is a single string — no hot-key problem at this scale

### Kafka
- Single partition per topic is fine for development
- For production: increase `RATING_EVENTS` partition count and key by `tutor_id` to ensure per-tutor ordering while parallelising across instances

### Bottlenecks to watch
- `list_top_candidates` does a full table scan with computed sort — add a materialised view or partial index on `(is_active, is_verified)` as the tutor count grows
- bcrypt is intentionally slow — if registration becomes a bottleneck, move hashing to a thread pool executor

---

## 16. Common Interview Questions

**Q: How does the service prevent duplicate registrations?**  
A: The `email` column has a `UNIQUE` constraint in Postgres. `AuthService.register()` catches `IntegrityError`, rolls back the session, and returns `HTTP 409`. The constraint is enforced at the DB level, not just the application level, so it's safe even under concurrent requests.

---

**Q: How does JWT authentication work here?**  
A: On login, the service creates a JWT signed with HS256 using `JWT_SECRET_KEY`. The payload contains `sub` (user UUID), `exp` (expiry timestamp), and `type: "access"`. On protected endpoints, `get_current_user()` decodes and verifies the token, then fetches the user from Postgres to confirm they still exist and are active. There's no token blacklist — revocation requires waiting for expiry or rotating the secret key.

---

**Q: How are tutor ratings updated without race conditions?**  
A: The `increment_rating` repository method uses a single `UPDATE ... SET rating_sum = rating_sum + score, total_reviews = total_reviews + 1` statement. This is an atomic operation at the database level — Postgres locks the row for the duration of the update, so concurrent rating events can't produce a lost update.

---

**Q: Why does the leaderboard cache get invalidated instead of updated?**  
A: The leaderboard is a ranked list of all verified tutors. When any tutor's rating changes, their position in the list may change. Recomputing and re-serializing the entire list on every rating event is wasteful. It's cheaper to delete the cache key and let the next HTTP request rebuild it from a fresh DB query.

---

**Q: How does the Kafka consumer run alongside the HTTP server?**  
A: FastAPI's `lifespan` context manager runs startup/shutdown logic. During startup, `RatingEventsConsumer.start()` creates an `asyncio.Task` that runs `_run_loop()` concurrently with the HTTP server on the same event loop. The task is cancelled and awaited during shutdown.

---

**Q: What happens if Redis is down?**  
A: `get_cached_payload()` catches all Redis exceptions and returns `None`, which the service treats as a cache miss. The leaderboard query falls through to Postgres. `invalidate()` also catches exceptions and logs them without raising. The service degrades gracefully — slower, but functional.

---

**Q: How is the admin endpoint protected against timing attacks?**  
A: `secrets.compare_digest(provided, expected)` is used instead of `==`. This function always takes the same amount of time regardless of how many characters match, preventing an attacker from inferring the key one character at a time by measuring response times. A length check is also done first to avoid a different short-circuit.

---

**Q: Why is `become_tutor` and the role upgrade in the same transaction?**  
A: If the profile insert succeeded but the role update failed (or vice versa), the system would be in an inconsistent state — a user with `role='user'` but an existing tutor profile, or `role='tutor'` with no profile. Wrapping both in a single `session.commit()` ensures they succeed or fail together.

---

**Q: How does the service handle a `RATING_SUBMITTED` event for a non-existent tutor?**  
A: `increment_rating()` runs an `UPDATE ... WHERE user_id = ? AND is_active = true`. If no row matches, `rowcount` is `0`. `apply_rating_from_event()` returns `False`, the session is committed (no-op), and the consumer moves on. No exception is raised.

---

**Q: What is the `asyncio.sleep(10)` in the lifespan for?**  
A: It's a startup delay to give Kafka time to be fully ready before the producer and consumer attempt to connect. In production this would be replaced by a proper health-check retry loop.

---

## 17. Future Improvements

- **Token refresh & revocation** — Add a `refresh_token` flow and a Redis-backed token blacklist (store JTI on logout with TTL matching token expiry)
- **Email verification** — Send a verification link on registration; gate login on `email_verified` flag
- **OAuth2 / Social login** — Google/GitHub sign-in via `authlib`
- **Rate limiting** — Redis-backed sliding window on `/auth/login` to prevent brute-force attacks
- **Alembic auto-migration in Docker** — Add an entrypoint script that runs `alembic upgrade head` before starting uvicorn
- **Structured logging** — Replace `logging.basicConfig` with `structlog` for JSON log output compatible with CloudWatch / Datadog
- **Metrics** — Expose Prometheus metrics (request count, latency, cache hit rate) via `prometheus-fastapi-instrumentator`
- **Pagination on leaderboard** — Add cursor-based pagination for the leaderboard endpoint
- **Kafka dead-letter queue** — Route unprocessable `RATING_EVENTS` messages to a DLQ topic instead of silently dropping them
- **Async migration runner** — The current Alembic `env.py` needs to be run separately; integrate it into the lifespan startup with a lock to support multi-instance deployments safely
