# MASTER SPECIFICATION: StudySync (Study Group & Tutor Marketplace)

## 1. SYSTEM OVERVIEW
StudySync is a distributed microservices platform built for high-concurrency educational networking. 
* **Core Concept:** There are no separate "Teacher" accounts. Every user is a standard user. A user can create a `tutor_profile` to unlock paid hosting capabilities.
* **Session Duality:** Normal users can host free "Study Groups". Verified tutors can host "Paid Sessions".

## 2. TECHNOLOGY STACK
* **Backend Framework:** FastAPI (Python 3.10+) - Fully asynchronous.
* **Relational DB:** PostgreSQL (via SQLAlchemy 2.0 async + Alembic for migrations).
* **NoSQL DB:** MongoDB (via Motor/Beanie) - Used for flexible schemas and geospatial queries.
* **Message Broker:** Apache Kafka (via aiokafka) - For asynchronous event-driven communication.
* **Cache & Locks:** Redis (via redis.asyncio) - For caching, rate limiting, and transaction idempotency.
* **Containerization:** Docker & Docker Compose.

---

## 3. MICROSERVICES & DOMAIN BOUNDARIES
This system strictly follows the Database-per-Service pattern. Microservices DO NOT share databases and DO NOT enforce hard Foreign Keys across domains. 

### A. Identity & Profile Service
* **Responsibility:** User Auth (JWT), Profile Management, and Tutor Onboarding.
* **Database:** PostgreSQL (`identity_db`)
* **Tables:**
  * `users`: `id` (UUID, PK), `email`, `password_hash`, `role`, `last_known_latitude`, `last_known_longitude`, `created_at`.
  * `tutor_profiles`: `id` (UUID, PK), `user_id` (UUID, Unique, Soft-link to `users`), `bio` (Text), `expertise` (Array), `hourly_rate` (Decimal), `rating_sum` (Int), `total_reviews` (Int), `is_verified` (Boolean).

### B. Session & Booking Service
* **Responsibility:** Group discovery, session creation, and ratings. 
* **Database:** MongoDB (`session_db`)
* **Collections:**
  * `sessions`: `_id` (ObjectId), `host_id` (UUID string), `title`, `description`, `schedule_time`, `is_paid` (Bool), `price` (Decimal), `participants` (Array of UUID strings), `location` (GeoJSON Point with `2dsphere` index for fast geospatial querying).
  * `ratings`: `_id` (ObjectId), `session_id`, `student_id`, `tutor_id`, `score` (1-5), `review_text`.

### C. Payment & Ledger Service
* **Responsibility:** Financial transactions, idempotency handling, and commission split.
* **Database:** PostgreSQL (`payment_db`)
* **Tables:**
  * `transactions`: `id` (UUID, PK), `idempotency_key` (String, Unique Index), `student_id`, `session_id`, `amount`, `status` (pending/completed/failed).
  * `tutor_ledgers`: `id` (UUID, PK), `tutor_id`, `available_balance`, `total_earned`.

---

## 4. EVENT-DRIVEN ARCHITECTURE (KAFKA)
Services communicate state changes asynchronously via Kafka to prevent blocking APIs.
* **Topic: `PAYMENT_EVENTS`**
  * `PAYMENT_SUCCESS`: Emitted by Payment Service. Session Service consumes to add `student_id` to session `participants`.
* **Topic: `RATING_EVENTS`**
  * `RATING_SUBMITTED`: Emitted by Session Service. Identity Service consumes to calculate and update `rating_sum` and `total_reviews` for the tutor.
* **Topic: `USER_EVENTS`**
  * `TUTOR_VERIFIED`: Emitted by Identity Service. Session Service caches this to allow the user to create `is_paid = true` sessions.

---

## 5. SYSTEM CONSTRAINTS & PATTERNS
1. **Geospatial Searches:** User locations are passed dynamically from the frontend to the Session Service to query MongoDB `2dsphere` indexes using `$near`. Do NOT use Redis for location tracking.
2. **Caching Strategy:** Redis is strictly used for:
   * Top Tutors Cache (Read-heavy).
   * Payment Idempotency Keys (Write-heavy/Locks using `SETNX`).
3. **Database Migrations:** Every PostgreSQL microservice must contain its own `alembic` setup to track schema changes.
4. **Soft Deletes:** Use `is_active` boolean flags rather than permanently deleting database rows to preserve foreign key integrity on ledgers and past sessions.

---

## 6. PROJECT DIRECTORY STRUCTURE (DDD)
Each microservice must adhere to this Domain-Driven structure:
```text
[service_name]/
├── app/
│   ├── main.py                 # FastAPI instance & routers
│   ├── core/                   # Config, DB connections, Redis pools
│   ├── models/                 # SQLAlchemy/Beanie DB Models
│   ├── schemas/                # Pydantic validation schemas
│   ├── api/v1/                 # Endpoints/Controllers
│   ├── services/               # Business Logic
│   ├── repositories/           # Direct DB CRUD operations
│   └── events/                 # Kafka Producers/Consumers
├── alembic/                    # (Only for Postgres services)
├── Dockerfile                  
└── requirements.txt

## 4. EVENT-DRIVEN ARCHITECTURE (KAFKA)
Services communicate state changes asynchronously via Kafka to prevent blocking APIs. We implement this using the `aiokafka` library.

* **Implementation Pattern:**
  * **Producers:** Fire-and-forget JSON payloads after local database commits.
  * **Consumers:** Run as `asyncio` background tasks initialized during the FastAPI `lifespan` startup event.

* **Topic: `PAYMENT_EVENTS`**
  * `PAYMENT_SUCCESS`: 
    * *Producer:* Payment Service (Emits `session_id`, `student_id`).
    * *Consumer:* Session Service (Appends `student_id` to MongoDB `participants` array).
* **Topic: `RATING_EVENTS`**
  * `RATING_SUBMITTED`: 
    * *Producer:* Session Service (Emits `tutor_id`, `score`).
    * *Consumer:* Identity Service (Recalculates Postgres `rating_sum` and `total_reviews`).
* **Topic: `USER_EVENTS`**
  * `TUTOR_VERIFIED`: 
    * *Producer:* Identity Service.
    * *Consumer:* Session Service (Updates Redis cache of verified tutors to authorize paid session creation).

---

## 5. SYSTEM CONSTRAINTS, REDIS & CACHING PATTERNS
1. **Geospatial Searches:** User locations are passed dynamically from the frontend to the Session Service to query MongoDB `2dsphere` indexes using `$near`. Do NOT use Redis for location tracking.
2. **Redis Implementation (`redis.asyncio`):**
   * **The Read Cache (`GET` / `SETEX`):** Used by Identity Service to cache `marketplace:top_tutors` with a TTL (Time-to-Live) to reduce Postgres load.
   * **The Idempotency Lock (`SETNX`):** Used by Payment Service (`lock:payment:{idempotency_key}`). If `SETNX` returns false, the request is a duplicate and must be rejected with a 409 Conflict.
3. **Database Migrations:** Every PostgreSQL microservice must contain its own `alembic` setup to track schema changes.
4. **Soft Deletes:** Use `is_active` boolean flags rather than permanently deleting database rows to preserve foreign key integrity on ledgers and past sessions.
5. **Testing & TDD:** Business logic must be testable without live infrastructure. Redis and Kafka clients must be injected as dependencies so they can be easily mocked using `pytest` during unit testing.