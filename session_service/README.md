# Session & Booking Service — StudySync

## 1. Service Overview

The Session & Booking Service owns everything related to study sessions: creation, discovery, lifecycle management, participation, and ratings. It is the most feature-rich service in the platform and the central hub for real-time educational activity.

It uses **MongoDB** for flexible document storage and geospatial queries, **Redis** for caching nearby session results, and **Kafka** for async communication with the Identity and Payment services.

---

## 2. Responsibilities

### What it handles
- Creating free and paid sessions (host must be a verified tutor for paid)
- Geospatial discovery of nearby sessions (`$nearSphere` + `2dsphere` index)
- Session lifecycle management: `scheduled → active → completed / cancelled`
- Joining free sessions and leaving sessions
- Receiving `PAYMENT_SUCCESS` events to add paid participants
- Receiving `TUTOR_VERIFIED` events to maintain a local verified-tutor read model
- Submitting and fetching ratings for completed sessions
- Emitting `RATING_SUBMITTED` events to Kafka for Identity Service to update tutor scores

### What it does NOT handle
- Authentication or token issuance (trusts JWT from Identity Service)
- Payment processing (→ Payment & Ledger Service)
- Tutor profile management (→ Identity Service)

---

## 3. High-Level Architecture

```
                         ┌──────────────────────────────────────┐
                         │         Session Service              │
                         │                                      │
  HTTP + JWT             │  FastAPI Router                      │
  ──────────────────►    │      │                               │
                         │      ▼                               │
                         │  Pydantic Schemas                    │
                         │      │                               │
                         │      ▼                               │
                         │  Service Layer                       │
                         │      │           │                   │
                         │      ▼           ▼                   │
                         │  Repository  NearbySessionsCache     │
                         │  (Motor)     (Redis GET/SETEX)       │
                         │      │                               │
                         │      ▼                               │
                         │  MongoDB (session_db)                │
                         │  ├── sessions                        │
                         │  ├── ratings                         │
                         │  └── verified_tutors                 │
                         │                                      │
  RATING_EVENTS ◄────────│  KafkaProducer                       │
  USER_EVENTS   ────────►│  KafkaConsumer (UserEventsConsumer)  │
  PAYMENT_EVENTS────────►│  KafkaConsumer (PaymentEventsConsumer│
                         └──────────────────────────────────────┘
```

---

## 4. Session State Machine

Sessions follow a strict one-way lifecycle. Invalid transitions are rejected with `HTTP 409`.

```
              ┌─────────────┐
              │  scheduled  │ ◄── initial state on creation
              └──────┬──────┘
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
    ┌──────────┐         ┌────────────┐
    │  active  │         │ cancelled  │ ◄── host only, from scheduled or active
    └────┬─────┘         └────────────┘
         │
         ▼
   ┌───────────┐
   │ completed │ ◄── ratings can only be submitted here
   └───────────┘
```

| From \ To   | scheduled | active | completed | cancelled |
|-------------|-----------|--------|-----------|-----------|
| scheduled   | —         | ✅     | ❌        | ✅        |
| active      | ❌        | —      | ✅        | ❌        |
| completed   | ❌        | ❌     | —         | ❌        |
| cancelled   | ❌        | ❌     | ❌        | —         |

> `PATCH /sessions/{id}/cancel` is a convenience shortcut — it always sets status to `cancelled` without requiring the caller to know the state machine. It validates that the session is not already `completed`.

---

## 5. API Reference

Base path: `/api/v1`  
All endpoints require `Authorization: Bearer <jwt>` unless noted.

### Session Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/sessions/` | JWT | Create a new session |
| `GET` | `/sessions/nearby` | JWT | Discover nearby sessions (with filters + pagination) |
| `GET` | `/sessions/my` | JWT | List sessions hosted by the current user |
| `GET` | `/sessions/{id}` | JWT | Get full session details |
| `PATCH` | `/sessions/{id}` | JWT (host) | Update session fields |
| `PATCH` | `/sessions/{id}/cancel` | JWT (host) | Cancel a session |
| `PATCH` | `/sessions/{id}/status` | JWT (host) | Advance session status |
| `POST` | `/sessions/{id}/join` | JWT | Join a free session |
| `POST` | `/sessions/{id}/leave` | JWT (participant) | Leave a session |
| `GET` | `/sessions/{id}/participants` | JWT (host) | List all participants |

### Rating Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/sessions/{id}/ratings` | JWT (participant) | Submit a rating for a completed session |
| `GET` | `/sessions/{id}/ratings` | JWT | Fetch all ratings for a session |

### Ops

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | None | Liveness probe |

---

## 6. Detailed Backend Workflows

### 6.1 Create Session

```
POST /api/v1/sessions/  {title, session_type, price, location, ...}
  │  Authorization: Bearer <jwt>
  │
  ▼
get_current_user_id()  →  decode JWT → extract user UUID (no DB call)
  │
  ▼
SessionService.create_session()
  ├── [paid] VerifiedTutorRepository.is_verified(host_id)
  │     └── MongoDB: verified_tutors.find_one({tutor_id, is_verified: true})
  │     └── 403 if not verified
  ├── [free + price > 0] → 422
  ├── Build Session document with GeoPoint {type: "Point", coordinates: [lon, lat]}
  └── SessionRepository.create()  →  MongoDB insert_one
  │
  ▼
HTTP 201  SessionRead
```

---

### 6.2 Discover Nearby Sessions

```
GET /api/v1/sessions/nearby?longitude=...&latitude=...&radius_km=10
                            &limit=20&offset=0
                            &session_type=free
                            &min_price=0&max_price=50
                            &subject_tags=Math&subject_tags=Physics
  │
  ▼
SessionService.nearby()
  │
  ├── [no filters, offset=0] → NearbySessionsCacheService.get(lon, lat, radius)
  │     └── Redis GET session:nearby:{lon}:{lat}:{radius}
  │     └── [HIT] deserialize JSON → return
  │
  └── [MISS or filtered]
        ├── SessionRepository.find_nearby()
        │     └── MongoDB $nearSphere query with optional filters:
        │           status: "scheduled"
        │           session_type: ?
        │           price: {$gte: min, $lte: max}
        │           subject_tags: {$in: [...]}
        │         .skip(offset).limit(limit)
        ├── [no filters, offset=0] → Redis SETEX with TTL 60s
        └── Return list[SessionRead]
```

---

### 6.3 Update Session

```
PATCH /api/v1/sessions/{id}  {title?, description?, max_participants?, ...}
  │  Authorization: Bearer <jwt>
  │
  ▼
SessionService.update_session()
  ├── get_or_404(session_id)
  ├── Guard: session.host_id == requester_id  →  403 if not
  ├── Guard: session.status == "scheduled"    →  409 if not
  ├── Build partial $set dict from non-None fields only
  └── SessionRepository.update()  →  find_one_and_update({$set: fields})
  │
  ▼
HTTP 200  SessionRead
```

---

### 6.4 Cancel Session

```
PATCH /api/v1/sessions/{id}/cancel
  │
  ▼
SessionService.cancel_session()
  ├── get_or_404(session_id)
  ├── Guard: host_id == requester_id          →  403
  ├── Guard: status != "completed"            →  409
  ├── [already cancelled] → return early (idempotent)
  └── SessionRepository.set_status("cancelled")
  │
  ▼
HTTP 200  SessionRead {status: "cancelled"}
```

---

### 6.5 Status Transition

```
PATCH /api/v1/sessions/{id}/status  {status: "active"}
  │
  ▼
SessionService.update_status()
  ├── get_or_404(session_id)
  ├── Guard: host_id == requester_id
  ├── SessionRepository.is_valid_transition(current, new)
  │     └── Lookup _ALLOWED_TRANSITIONS dict
  │     └── 409 if transition not allowed
  └── SessionRepository.set_status(new_status)
  │
  ▼
HTTP 200  SessionRead
```

---

### 6.6 Leave Session

```
POST /api/v1/sessions/{id}/leave
  │
  ▼
SessionService.leave_session()
  ├── get_or_404(session_id)
  ├── Guard: status not in [completed, cancelled]  →  409
  ├── Guard: user_id in session.participants        →  409 if not
  └── SessionRepository.remove_participant()
        └── MongoDB $pull participants array
  │
  ▼
HTTP 200  SessionRead (updated participant_count)
```

---

### 6.7 Submit Rating

```
POST /api/v1/sessions/{id}/ratings  {score: 4, comment: "..."}
  │
  ▼
RatingService.submit()
  ├── get session → 404 if missing
  ├── Guard: student_id in session.participants  →  403
  ├── Guard: session.status == "completed"       →  409
  ├── RatingRepository.exists(session_id, student_id)  →  409 if already rated
  ├── RatingRepository.create()
  │     └── MongoDB insert_one (unique index on session_id+student_id)
  └── publish_rating_submitted(producer)
        └── Kafka RATING_EVENTS: {event_type, tutor_id, student_id, score}
  │
  ▼
HTTP 201  RatingRead
```

---

### 6.8 Kafka: PAYMENT_SUCCESS Consumer

```
PAYMENT_EVENTS topic
  └── {event_type: "PAYMENT_SUCCESS", session_id: "...", student_id: "..."}
        │
        ▼
PaymentEventsConsumer._run_loop()
  ├── Validate event_type, session_id, student_id
  └── SessionRepository.add_participant(session_id, student_id)
        └── MongoDB atomic $addToSet with capacity check
```

---

### 6.9 Kafka: TUTOR_VERIFIED Consumer

```
USER_EVENTS topic
  └── {event_type: "TUTOR_VERIFIED", user_id: "..."}
        │
        ▼
UserEventsConsumer._run_loop()
  └── VerifiedTutorRepository.upsert(tutor_id)
        └── MongoDB update_one with upsert=True
              Sets is_verified=true, updates updated_at
```

---

## 7. Discovery: Pagination & Filtering

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `longitude` | float | required | Center point longitude (-180 to 180) |
| `latitude` | float | required | Center point latitude (-90 to 90) |
| `radius_km` | float | `10.0` | Search radius in km (max 100) |
| `limit` | int | `20` | Results per page (max 100) |
| `offset` | int | `0` | Skip N results for pagination |
| `session_type` | string | `null` | Filter: `free` or `paid` |
| `min_price` | float | `null` | Minimum price filter |
| `max_price` | float | `null` | Maximum price filter |
| `subject_tags` | string[] | `null` | Filter by subject tags (OR match) |

### Caching Behaviour

Only the **unfiltered, offset=0** query is cached in Redis (key: `session:nearby:{lon}:{lat}:{radius}`, TTL: 60s). Filtered or paginated queries always hit MongoDB directly — their result sets are too varied to cache efficiently.

### Example

```
GET /api/v1/sessions/nearby
    ?longitude=72.88&latitude=19.07
    &radius_km=5
    &session_type=free
    &subject_tags=Math&subject_tags=Physics
    &limit=10&offset=20
```

---

## 8. Database Design

Database: **MongoDB 7** (`session_db`)  
Driver: **Motor** (async)  
Indexes: managed by `scripts/index_setup.py`

### `sessions` collection

| Field | Type | Notes |
|-------|------|-------|
| `_id` | string (UUID) | Document ID |
| `host_id` | string (UUID) | User ID from Identity Service |
| `title` | string | 3–200 chars |
| `description` | string \| null | Up to 2000 chars |
| `session_type` | `"free"` \| `"paid"` | |
| `price` | float | 0.0 for free sessions |
| `max_participants` | int | 1–500 |
| `participants` | string[] | Array of UUID strings |
| `status` | string | `scheduled / active / completed / cancelled` |
| `scheduled_time` | datetime | UTC |
| `location` | GeoJSON Point | `{type: "Point", coordinates: [lon, lat]}` |
| `subject_tags` | string[] | Up to 20 tags |
| `created_at` | datetime | Set by app on insert |
| `updated_at` | datetime | Updated on every write |

**Indexes:**
- `location` → `2dsphere` (required for `$nearSphere`)
- `host_id` → ascending
- `status` → ascending
- `(status, location)` → compound (used by nearby query)
- `scheduled_time` → ascending

### `ratings` collection

| Field | Type | Notes |
|-------|------|-------|
| `_id` | string (UUID) | |
| `session_id` | string (UUID) | |
| `tutor_id` | string (UUID) | Host of the session |
| `student_id` | string (UUID) | Reviewer |
| `score` | int | 1–5 |
| `comment` | string \| null | Up to 1000 chars |
| `created_at` | datetime | |

**Indexes:**
- `(session_id, student_id)` → unique (one rating per student per session)
- `tutor_id` → ascending

### `verified_tutors` collection

Local read-model. Populated by `TUTOR_VERIFIED` Kafka events.

| Field | Type | Notes |
|-------|------|-------|
| `tutor_id` | string (UUID) | Unique |
| `is_verified` | bool | Always `true` when present |
| `created_at` / `updated_at` | datetime | |

**Indexes:**
- `tutor_id` → unique

---

## 9. Event & Messaging Integration

| Topic | Direction | Event | Payload |
|-------|-----------|-------|---------|
| `RATING_EVENTS` | **Producer** | `RATING_SUBMITTED` | `{event_type, tutor_id, student_id, score}` |
| `USER_EVENTS` | **Consumer** | `TUTOR_VERIFIED` | `{event_type, user_id}` |
| `PAYMENT_EVENTS` | **Consumer** | `PAYMENT_SUCCESS` | `{event_type, session_id, student_id}` |

Both consumers run as `asyncio` background tasks started in FastAPI `lifespan`. Each message gets its own error boundary — bad messages are logged and skipped without stopping the loop.

---

## 10. Caching Strategy

Pattern: **Cache-Aside** (same as Identity Service)

| Property | Value |
|----------|-------|
| Key | `session:nearby:{lon}:{lat}:{radius_km}` |
| TTL | 60 seconds |
| Invalidation | TTL expiry only (no explicit invalidation) |
| Scope | Unfiltered, offset=0 queries only |

Coordinates are rounded to 2 decimal places (~1 km precision) to bucket nearby requests into the same cache key. Filtered queries bypass the cache entirely.

---

## 11. Security Design

- **JWT validation:** `get_current_user_id()` in `deps.py` decodes the token using the shared `JWT_SECRET_KEY`. No DB call — the service is fully decoupled from Identity at runtime.
- **Host-only operations:** `update_session`, `cancel_session`, `update_status`, `get_participants` all compare `session.host_id == requester_id` and return `403` on mismatch.
- **Participant-only operations:** `leave_session` and `submit_rating` verify the user is in `session.participants`.
- **Verified tutor gate:** `create_session` with `session_type=paid` checks the local `verified_tutors` collection (populated via Kafka) — no synchronous call to Identity Service.
- **Idempotency:** `add_participant` uses `$addToSet` + capacity check in a single atomic MongoDB update. `VerifiedTutorRepository.upsert` is safe to call multiple times.

---

## 12. Error Handling

| Scenario | Status | Detail |
|----------|--------|--------|
| Session not found | 404 | `"Session not found"` |
| Not the host | 403 | `"Only the host can ..."` |
| Not a participant | 409 | `"You are not a participant"` |
| Session full | 409 | `"Session is full"` |
| Already joined | 409 | `"Already joined this session"` |
| Invalid status transition | 409 | `"Cannot transition from '...' to '...'"` |
| Leave completed/cancelled | 409 | `"Cannot leave a completed or cancelled session"` |
| Rating on non-completed session | 409 | `"Ratings can only be submitted for completed sessions"` |
| Duplicate rating | 409 | `"You have already rated this session"` |
| Paid session, unverified tutor | 403 | `"Only verified tutors can create paid sessions"` |
| Free session with price > 0 | 422 | `"Free sessions cannot have a price"` |
| Kafka producer unavailable | 503 | `"Kafka producer is not available"` |

---

## 13. Project Structure

```
session_service/
├── app/
│   ├── main.py                        # FastAPI app factory + lifespan
│   ├── core/
│   │   ├── config.py                  # Pydantic Settings
│   │   ├── database.py                # Motor client + get_db dependency
│   │   ├── redis_client.py            # Redis connection factory
│   │   └── security.py               # JWT decode (no issuance)
│   ├── models/
│   │   ├── base.py                    # BaseDocument with created_at/updated_at
│   │   ├── session.py                 # Session, GeoPoint, SessionType, SessionStatus
│   │   ├── rating.py                  # Rating document
│   │   └── verified_tutor.py          # Local read-model for verified tutors
│   ├── schemas/
│   │   ├── session.py                 # SessionCreate, SessionUpdate, SessionStatusUpdate,
│   │   │                              # SessionRead, NearbySearchParams
│   │   └── rating.py                  # RatingSubmit, RatingRead
│   ├── api/
│   │   └── v1/
│   │       ├── __init__.py            # Router aggregator
│   │       ├── deps.py                # get_current_user_id (JWT decode only)
│   │       ├── sessions.py            # All session endpoints
│   │       └── ratings.py             # Submit + fetch ratings
│   ├── services/
│   │   ├── session_service.py         # All session business logic
│   │   ├── rating_service.py          # Rating submit + list logic
│   │   └── nearby_sessions_cache.py   # Redis cache wrapper
│   ├── repositories/
│   │   ├── session_repository.py      # All MongoDB session queries
│   │   ├── rating_repository.py       # Rating CRUD + list
│   │   └── verified_tutor_repository.py # Upsert + is_verified check
│   └── events/
│       ├── kafka_producer.py          # publish_rating_submitted
│       └── kafka_consumer.py          # PaymentEventsConsumer, UserEventsConsumer
├── scripts/
│   └── index_setup.py                 # One-time MongoDB index creation
├── .env.example
├── Dockerfile
└── requirements.txt
```

---

## 14. Deployment

### Docker (recommended)

```bash
# From repo root
docker compose up -d --build session_service

docker compose logs -f session_service
```

Service available at `http://localhost:8001/docs`

### Run MongoDB indexes (once after first deploy)

```bash
docker compose exec session_service python -m scripts.index_setup
```

### Host uvicorn + Docker data stack

```bash
docker compose up -d mongo redis zookeeper kafka

cd session_service
cp .env.example .env
# Edit .env: set JWT_SECRET_KEY to match identity_service/.env exactly

pip install -r requirements.txt
python -m scripts.index_setup
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

### Environment Variables

| Variable | Default | Notes |
|----------|---------|-------|
| `MONGODB_URL` | `mongodb://localhost:27017` | Use `mongodb://mongo:27017` in Docker |
| `MONGODB_DB_NAME` | `session_db` | |
| `REDIS_URL` | `redis://localhost:6379/1` | Use `redis://redis:6379/1` in Docker |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` | Use `kafka:29092` in Docker |
| `JWT_SECRET_KEY` | — | **Must match Identity Service exactly** |
| `NEARBY_SESSIONS_CACHE_TTL_SECONDS` | `60` | |

---

## 15. Design Decisions

**Why MongoDB?** Sessions have a flexible schema (subject tags, GeoJSON location, participants array) and require geospatial queries. MongoDB's native `2dsphere` index and `$nearSphere` operator handle this natively. A relational DB would need PostGIS and a join table for participants.

**Why no DB call in JWT validation?** The session service trusts the JWT signature. Hitting the Identity Service DB on every request would create tight coupling and a network dependency. If the token is valid and not expired, the user is trusted.

**Why a local `verified_tutors` collection?** Calling the Identity Service synchronously to check tutor verification on every `POST /sessions` would create a hard runtime dependency. The Kafka-driven read model keeps the service autonomous — it works even if Identity is temporarily down.

**Why `$addToSet` + `$expr` for joining?** A single atomic MongoDB update prevents race conditions where two concurrent join requests could both pass the capacity check and both succeed. The `$expr: {$lt: [{$size: "$participants"}, "$max_participants"]}` check and the `$addToSet` happen in one operation.

**Why offset pagination instead of cursor for nearby?** `$nearSphere` results are sorted by distance, not by a stable document field. Cursor-based pagination (keyset) requires a stable sort key. Offset is acceptable here because the result set is small (max 100) and bounded by radius.

**Why only cache unfiltered nearby queries?** Filtered queries produce highly varied result sets. Caching every combination of filters would create unbounded cache key space and low hit rates. The unfiltered default query (what most users see on app open) has high hit rate and justifies caching.
