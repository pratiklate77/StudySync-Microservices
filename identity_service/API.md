# Identity Service API Documentation

## Table of Contents
1. [Overview](#overview)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
4. [Request/Response Examples](#requestresponse-examples)
5. [Inter-Service Communication](#inter-service-communication)
6. [Kafka Events](#kafka-events)
7. [Error Handling](#error-handling)
8. [Common Flows](#common-flows)

---

## Overview

The **Identity Service** is the single source of truth for user authentication and profile management in StudySync. It handles:

- **User authentication** (registration, login, JWT tokens)
- **User profiles** (location tracking, role management)
- **Tutor profiles** (bio, expertise, hourly rate, verification status)
- **Tutor ratings** (aggregation from session reviews via Kafka)
- **Tutor leaderboard** (cached rankings)

**Technology Stack:**
- FastAPI (async Python framework)
- PostgreSQL (persistent storage)
- Redis (caching, tutor leaderboard)
- Kafka (event publishing to other services)

**Service runs on:** `localhost:8000` (or `identity_service:8000` inside Docker)

---

## Authentication

All API endpoints (except `/auth/register` and `/auth/login`) require a **Bearer JWT token**.

### Token Structure
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1ZjNjNzEmIiwiZXhwIjoxNjM5MDAwMDAwfQ.SIGNATURE
```

**Token Details:**
- **Algorithm:** HS256 (HMAC-SHA256)
- **Payload:** `{sub: "user_id", exp: "expiration_timestamp", type: "access"}`
- **Expiration:** 1440 minutes (24 hours) from issuance
- **Secret:** Set in `.env` as `JWT_SECRET_KEY`

### How JWT is Validated
```python
# Every protected endpoint uses this dependency:
async def get_current_user(credentials: HTTPAuthorizationCredentials) -> User:
    1. Extract token from "Authorization: Bearer YOUR_TOKEN_HERE"
    2. Decode JWT using JWT_SECRET_KEY
    3. Extract user_id from payload["sub"]
    4. Fetch user from database
    5. Verify user exists and is_active == True
    6. Return User object to endpoint
```

If any step fails → `HTTP 401 Unauthorized`

---

## API Endpoints

### Authentication APIs

#### 1. Register User
```
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "student@example.com",
  "password": "SecurePassword123"
}
```

**Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "student@example.com",
  "role": "user",
  "is_active": true,
  "last_known_latitude": null,
  "last_known_longitude": null,
  "created_at": "2026-04-17T10:30:00Z"
}
```

**Errors:**
- `409 Conflict` — Email already registered
- `422 Unprocessable Entity` — Invalid email format or password too short (<8 chars)

---

#### 2. Login User
```
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "student@example.com",
  "password": "SecurePassword123"
}
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Errors:**
- `401 Unauthorized` — Incorrect email/password or user is inactive

---

#### 3. Get Current User Profile
```
GET /api/v1/auth/profile
Authorization: Bearer YOUR_TOKEN_HERE
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "student@example.com",
  "role": "user",
  "is_active": true,
  "last_known_latitude": 40.7128,
  "last_known_longitude": -74.0060,
  "created_at": "2026-04-17T10:30:00Z",
  "tutor_profile": null
}
```

**If user is a tutor, `tutor_profile` contains:**
```json
{
  "id": "tutor-uuid",
  "bio": "Expert in Math and Physics",
  "expertise": ["Mathematics", "Physics", "Calculus"],
  "hourly_rate": 50.00,
  "is_verified": true,
  "rating_sum": 480,
  "total_reviews": 96,
  "average_rating": 5.0
}
```

**Errors:**
- `401 Unauthorized` — Invalid or expired token

---

#### 4. Update User Profile (Location)
```
PATCH /api/v1/auth/profile
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "last_known_latitude": 40.7128,
  "last_known_longitude": -74.0060
}
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "student@example.com",
  "role": "user",
  "is_active": true,
  "last_known_latitude": 40.7128,
  "last_known_longitude": -74.0060,
  "created_at": "2026-04-17T10:30:00Z",
  "tutor_profile": null
}
```

**Errors:**
- `422 Unprocessable Entity` — Latitude not in [-90, 90] or longitude not in [-180, 180]

---

### Tutor Profile APIs

#### 5. Become a Tutor
```
POST /api/v1/tutors/become
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "bio": "I have 5 years of experience teaching Math",
  "expertise": ["Mathematics", "Algebra", "Calculus"],
  "hourly_rate": 50.00
}
```

**Response (201 Created):**
```json
{
  "id": "tutor-uuid",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "bio": "I have 5 years of experience teaching Math",
  "expertise": ["Mathematics", "Algebra", "Calculus"],
  "hourly_rate": 50.00,
  "rating_sum": 0,
  "total_reviews": 0,
  "is_verified": false
}
```

**Business Logic:**
- User cannot already have a tutor profile
- User must be active
- Hourly rate is rounded to 2 decimal places
- New tutors are **NOT verified by default** → Must be verified by admin before creating paid sessions
- User role is automatically updated to `"tutor"`

**Errors:**
- `409 Conflict` — User already has a tutor profile
- `403 Forbidden` — User account is inactive

---

#### 6. Get Tutor Leaderboard (Top Verified Tutors)
```
GET /api/v1/tutors/leaderboard?limit=20
Authorization: Bearer YOUR_TOKEN_HERE
```

**Response (200 OK):**
```json
[
  {
    "id": "tutor-1",
    "user_id": "user-1",
    "bio": "Expert in all STEM subjects",
    "expertise": ["Math", "Physics", "Chemistry"],
    "hourly_rate": 75.00,
    "rating_sum": 500,
    "total_reviews": 100,
    "is_verified": true
  },
  {
    "id": "tutor-2",
    "user_id": "user-2",
    "bio": "Specialized in English Literature",
    "expertise": ["English", "Literature", "Writing"],
    "hourly_rate": 45.00,
    "rating_sum": 290,
    "total_reviews": 58,
    "is_verified": true
  }
]
```

**Sorting:** By average rating (DESC), then by total_reviews (DESC)

**Filtering:**
- Only includes verified tutors with `is_verified == true`
- Only includes active tutors with `is_active == true`

**Caching:** Results are cached in Redis for 1 hour (configurable in `.env`)

**Query Parameters:**
- `limit` (optional, default=20): Number of results (1-50)

**Errors:**
- `422 Unprocessable Entity` — Limit out of range

---

#### 7. Search Tutors
```
GET /api/v1/tutors/search?expertise=Mathematics,Physics&verified_only=true&min_rating=4.0&limit=20&offset=0
Authorization: Bearer YOUR_TOKEN_HERE
```

**Response (200 OK):**
```json
[
  {
    "id": "tutor-1",
    "user_id": "user-1",
    "bio": "PhD in Mathematics",
    "expertise": ["Mathematics", "Calculus", "Linear Algebra"],
    "hourly_rate": 60.00,
    "rating_sum": 400,
    "total_reviews": 80,
    "is_verified": true
  }
]
```

**Query Parameters:**
- `expertise` (optional): Comma-separated list of expertise tags to filter by
- `verified_only` (optional, default=false): Only show verified tutors
- `min_rating` (optional): Minimum average rating (0-5)
- `limit` (optional, default=20): Results per page (1-100)
- `offset` (optional, default=0): Pagination offset

**Behavior:**
- If expertise is provided, returns tutors whose expertise list overlaps with the query
- Sorts by average rating (DESC), then by total_reviews (DESC)

---

#### 8. Get Tutor Profile by ID
```
GET /api/v1/tutors/{tutor_id}
Authorization: Bearer YOUR_TOKEN_HERE
```

**Response (200 OK):**
```json
{
  "id": "tutor-uuid",
  "user_id": "user-uuid",
  "bio": "Ph.D. in Computer Science",
  "expertise": ["Python", "JavaScript", "Data Science"],
  "hourly_rate": 80.00,
  "rating_sum": 450,
  "total_reviews": 90,
  "is_verified": true
}
```

**Errors:**
- `404 Not Found` — Tutor ID doesn't exist or tutor is inactive

---

#### 9. Get Tutor Stats (with Average Rating)
```
GET /api/v1/tutors/{tutor_id}/stats
Authorization: Bearer YOUR_TOKEN_HERE
```

**Response (200 OK):**
```json
{
  "id": "tutor-uuid",
  "user_id": "user-uuid",
  "bio": "Ph.D. in Computer Science",
  "expertise": ["Python", "JavaScript"],
  "hourly_rate": 80.00,
  "is_verified": true,
  "average_rating": 4.85,
  "total_reviews": 90,
  "rating_sum": 450
}
```

**Calculation:** `average_rating = rating_sum / total_reviews` (or 0 if no reviews)

---

#### 10. Update Own Tutor Profile
```
PATCH /api/v1/tutors/profile
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "bio": "Updated bio - now 10 years experience",
  "expertise": ["Math", "Physics", "Engineering"],
  "hourly_rate": 65.00
}
```

**Response (200 OK):**
```json
{
  "id": "tutor-uuid",
  "user_id": "user-uuid",
  "bio": "Updated bio - now 10 years experience",
  "expertise": ["Math", "Physics", "Engineering"],
  "hourly_rate": 65.00,
  "rating_sum": 450,
  "total_reviews": 90,
  "is_verified": true
}
```

**Business Logic:**
- User can only update their own profile
- All fields are optional (include only what you want to change)
- Hourly rate is rounded to 2 decimal places

**Errors:**
- `403 Forbidden` — Trying to update someone else's profile
- `404 Not Found` — Tutor profile not found

---

#### 11. Delete Own Tutor Profile (Soft Delete)
```
DELETE /api/v1/tutors/profile
Authorization: Bearer YOUR_TOKEN_HERE
```

**Response (200 OK):**
```json
{
  "id": "tutor-uuid",
  "user_id": "user-uuid",
  "bio": "Ph.D. in Computer Science",
  "expertise": ["Python", "JavaScript"],
  "hourly_rate": 80.00,
  "rating_sum": 450,
  "total_reviews": 90,
  "is_verified": true
}
```

**Business Logic:**
- Marks tutor profile as `is_active = false` (soft delete)
- Does NOT delete from database
- Tutor will no longer appear in searches, leaderboard, or stats
- Data is preserved for historical/audit purposes

**Errors:**
- `403 Forbidden` — Trying to delete someone else's profile
- `404 Not Found` — Tutor profile not found

---

#### 12. Verify Tutor (Admin Only)
```
POST /api/v1/tutors/{user_id}/verify
X-Admin-API-Key: YOUR_ADMIN_API_KEY
Content-Type: application/json
```

**Response (200 OK):**
```json
{
  "id": "tutor-uuid",
  "user_id": "user-uuid",
  "bio": "Ph.D. in Computer Science",
  "expertise": ["Python", "JavaScript"],
  "hourly_rate": 80.00,
  "rating_sum": 0,
  "total_reviews": 0,
  "is_verified": true
}
```

**Business Logic:**
- Only admins can verify tutors (requires `X-Admin-API-Key` header)
- Sets `is_verified = true`
- Publishes `TUTOR_VERIFIED` Kafka event to notify other services
- Clears tutor leaderboard cache (will be rebuilt next request)

**Security:**
- Admin key is compared using constant-time comparison (prevents timing attacks)
- Admin key must match `ADMIN_API_KEY` env var exactly

**Errors:**
- `403 Forbidden` — Invalid or missing admin API key
- `404 Not Found` — Tutor profile not found
- `503 Service Unavailable` — Admin verification not configured

---

## Request/Response Examples

### Complete Workflow: User Registration → Become Tutor → Get Profile

**Step 1: Register**
```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "password": "SecurePass123"
  }'
```

**Response:**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "email": "john.doe@example.com",
  "role": "user",
  "is_active": true,
  "created_at": "2026-04-17T10:30:00Z",
  "last_known_latitude": null,
  "last_known_longitude": null
}
```

**Step 2: Login**
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "password": "SecurePass123"
  }'
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhMWIyYzNkNC1lNWY2LTc4OTAtYWJjZC1lZjEyMzQ1Njc4OTAiLCJleHAiOjE2MzAwMDAwMDB9.SIGNATURE",
  "token_type": "bearer"
}
```

**Step 3: Become Tutor**
```bash
curl -X POST http://localhost:8000/api/v1/tutors/become \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "bio": "I teach Mathematics with 5 years experience",
    "expertise": ["Mathematics", "Algebra", "Calculus"],
    "hourly_rate": 50.00
  }'
```

**Response:**
```json
{
  "id": "t1t2t3t4-t5t6-t7t8-t9ta-tbtctdtetftg",
  "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "bio": "I teach Mathematics with 5 years experience",
  "expertise": ["Mathematics", "Algebra", "Calculus"],
  "hourly_rate": 50.00,
  "rating_sum": 0,
  "total_reviews": 0,
  "is_verified": false
}
```

**Step 4: Get Profile (now shows tutor info)**
```bash
curl -X GET http://localhost:8000/api/v1/auth/profile \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response:**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "email": "john.doe@example.com",
  "role": "tutor",
  "is_active": true,
  "created_at": "2026-04-17T10:30:00Z",
  "tutor_profile": {
    "id": "t1t2t3t4-t5t6-t7t8-t9ta-tbtctdtetftg",
    "bio": "I teach Mathematics with 5 years experience",
    "expertise": ["Mathematics", "Algebra", "Calculus"],
    "hourly_rate": 50.00,
    "is_verified": false,
    "rating_sum": 0,
    "total_reviews": 0
  }
}
```

---

## Inter-Service Communication

### How Session Service Interacts with Identity Service

**Scenario: Session Service needs to verify a tutor before allowing paid session creation**

```
┌──────────────────┐
│ Session Service  │
│   (MongoDB)      │
└────────┬─────────┘
         │
         │ "Is tutor_id verified?"
         │ (Checks cached verified_tutors in Redis)
         │
         ▼
┌──────────────────┐
│ Identity Service │
│  (PostgreSQL)    │
│  (Redis cache)   │
└────────┬─────────┘
         │
         │ Publishes TUTOR_VERIFIED event
         │ when tutor is verified (via admin API)
         │
         ▼
    Kafka Topic: USER_EVENTS
         │
         ▼
┌──────────────────┐
│ Session Service  │
│ updates cached   │
│ verified_tutors  │
└──────────────────┘
```

**Flow:**
1. Admin verifies tutor → `POST /api/v1/tutors/{user_id}/verify`
2. Identity Service publishes `TUTOR_VERIFIED` event to Kafka `USER_EVENTS` topic
3. Session Service consumes the event and updates its Redis cache
4. When a user tries to create a paid session, Session Service checks the cache

**What Session Service Stores Locally (From Kafka Events):**
```
Redis Key: "verified_tutors:all"
Value: 
{
  "user-id-1": true,
  "user-id-2": true,
  "user-id-3": true,
  ...
}
```

---

### How Payment Service Interacts with Identity Service

**Scenario: Payment is completed for a paid session → Tutor gets a rating**

```
┌──────────────────┐
│ Payment Service  │
│  (Postgres)      │
└────────┬─────────┘
         │
         │ Publishes PAYMENT_SUCCESS event
         │ (session_id, student_id, tutor_id, amount)
         │
         ▼
    Kafka Topic: PAYMENT_EVENTS
         │
         ▼
┌──────────────────┐
│ Session Service  │
│  (MongoDB)       │
│ Adds student to  │
│ participants     │
└────────┬─────────┘
         │
         │ Session completes, student rates tutor
         │
         │ Publishes RATING_SUBMITTED event
         │ (tutor_id, score: 1-5)
         │
         ▼
   Kafka Topic: RATING_EVENTS
         │
         ▼
┌──────────────────┐
│ Identity Service │
│ (PostgreSQL)     │
│ Increments       │
│ rating_sum and   │
│ total_reviews    │
│ for tutor        │
└──────────────────┘
```

---

## Kafka Events

### 1. TUTOR_VERIFIED Event (Published by Identity Service)

**Topic:** `USER_EVENTS`

**When:** Admin verifies a tutor via `POST /api/v1/tutors/{user_id}/verify`

**Payload:**
```json
{
  "event_type": "TUTOR_VERIFIED",
  "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2026-04-17T10:30:00Z"
}
```

**Consumers:**
- **Session Service:** Caches the verified tutor ID in Redis to allow paid session creation

---

### 2. RATING_SUBMITTED Event (Consumed by Identity Service)

**Topic:** `RATING_EVENTS`

**When:** Session is completed and student submits a rating

**Payload:**
```json
{
  "event_type": "RATING_SUBMITTED",
  "tutor_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "score": 5,
  "timestamp": "2026-04-17T10:40:00Z"
}
```

**Action:** Identity Service increments:
- `TutorProfile.rating_sum += score` (increases total score)
- `TutorProfile.total_reviews += 1` (increases review count)

**Calculation:** Average rating = `rating_sum / total_reviews`

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | When |
|------|---------|------|
| 200 | OK | Successful GET, PATCH |
| 201 | Created | Successful POST (registration, become tutor) |
| 400 | Bad Request | Invalid request format |
| 401 | Unauthorized | Invalid/expired token or credentials |
| 403 | Forbidden | Missing permissions (e.g., trying to update someone else's profile) |
| 404 | Not Found | Resource doesn't exist (e.g., tutor ID not found) |
| 409 | Conflict | Resource already exists (e.g., email already registered, user already has tutor profile) |
| 422 | Unprocessable Entity | Validation failed (e.g., invalid email format, hourly_rate < 0) |
| 503 | Service Unavailable | Kafka producer or Redis unavailable |

### Example Error Responses

**Email Already Registered:**
```json
{
  "detail": "Email already registered"
}
```

**Invalid Token:**
```json
{
  "detail": "Could not validate credentials"
}
```

**Tutor Profile Not Found:**
```json
{
  "detail": "Tutor profile not found"
}
```

---

## Common Flows

### Flow 1: New Student Registration and Location Update

```
1. POST /api/v1/auth/register
   ✓ Create user account
   ✓ Get JWT token

2. POST /api/v1/auth/login
   ✓ Authenticate with email/password
   ✓ Get access token

3. PATCH /api/v1/auth/profile
   ✓ Update last_known_latitude/longitude
   ✓ Used by Session Service for geospatial queries
```

---

### Flow 2: Tutor Onboarding to First Session

```
1. POST /api/v1/auth/register
   ✓ Create user account

2. POST /api/v1/tutors/become
   ✓ Create tutor_profile with bio, expertise, hourly_rate
   ✓ User role changed from "user" to "tutor"
   ✓ ⚠️ tutor.is_verified = false (NOT verified yet)

3. (ADMIN ACTION) POST /api/v1/tutors/{user_id}/verify
   ✓ Set tutor.is_verified = true
   ✓ Publish TUTOR_VERIFIED → Kafka
   ✓ Session Service consumes event, caches verified tutor

4. Tutor can now create PAID sessions via Session Service
   ✓ Session Service checks: is tutor in verified_tutors cache? YES
   ✓ Allow session creation

5. Student books session → Payment completes
   ✓ Payment Service publishes PAYMENT_SUCCESS

6. Session progresses → Completed
   ✓ Student rates tutor (1-5 stars)
   ✓ Session Service publishes RATING_SUBMITTED

7. RATING_SUBMITTED → Consumed by Identity Service
   ✓ Tutor's rating_sum and total_reviews updated
   ✓ /api/v1/tutors/{tutor_id}/stats now shows updated average_rating
   ✓ Tutor moves up/down leaderboard (cached, expires in 1 hour)
```

---

### Flow 3: Finding and Booking a Tutor

```
1. Student logs in
   ✓ POST /api/v1/auth/login → Get JWT token

2. Browse Tutor Leaderboard
   ✓ GET /api/v1/tutors/leaderboard?limit=30
   ✓ All tutors are verified + have good ratings

3. Search Tutors by Subject
   ✓ GET /api/v1/tutors/search?expertise=Mathematics&min_rating=4.5
   ✓ Filter by expertise tags + minimum rating

4. View Tutor Profile
   ✓ GET /api/v1/tutors/{tutor_id}
   ✓ View bio, expertise, hourly_rate, is_verified, rating

5. View Tutor Stats (optional, for more detail)
   ✓ GET /api/v1/tutors/{tutor_id}/stats
   ✓ See average_rating, total_reviews, rating_sum

6. Switch to Session Service
   ✓ POST /api/v1/sessions/ (in Session Service)
   ✓ Create a paid session or join a free session
   ✓ Session Service verifies tutor is in verified_tutors cache
```

---

### Flow 4: Tutor Profile Management

```
UPDATE PROFILE:
1. PATCH /api/v1/tutors/profile
   {
     "bio": "New bio text",
     "expertise": ["NewTag1", "NewTag2"],
     "hourly_rate": 60.00
   }
   ✓ Only updatable by tutor themselves
   ✓ Rating info (rating_sum, total_reviews) NOT updatable

DELETE PROFILE (Soft Delete):
2. DELETE /api/v1/tutors/profile
   ✓ Marks tutor as is_active = false
   ✓ No longer appears in searches/leaderboard
   ✓ Data still in database (audit trail)
   ✓ User can still log in and potentially restore by creating new profile
```

---

## Environment Variables

Required `.env` file in `identity_service/`:

```bash
# Database
DATABASE_URL=postgresql+asyncpg://studysync:studysync_dev@localhost:5432/identity_db

# JWT
JWT_SECRET_KEY=your_super_secret_jwt_key_min_32_chars_recommended

# Admin Verification
ADMIN_API_KEY=your_admin_api_key_for_tutor_verification

# Redis
REDIS_URL=redis://localhost:6379/0

# Kafka
KAFKA_BOOTSTRAP_SERVERS=localhost:9092

# Cache TTLs (seconds)
TOP_TUTORS_CACHE_TTL=3600
```

---

## Testing the API Locally

### 1. Start Required Services
```bash
cd /path/to/StudySync-Microservices
docker compose up -d postgres redis kafka zookeeper

cd identity_service
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Test Registration
```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "Password123"}'
```

### 3. Test Login
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "Password123"}'
```

### 4. Test Protected Endpoint (Save token from login response)
```bash
curl -X GET http://localhost:8000/api/v1/auth/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 5. Open API Docs
```
http://localhost:8000/docs
```

Interactive Swagger UI with all endpoints and schema validation.

---

## Future Enhancements

- [ ] Token refresh endpoint (`POST /api/v1/auth/refresh`)
- [ ] Token revocation/logout
- [ ] Email verification on registration
- [ ] OAuth 2.0 integration (Google, GitHub)
- [ ] Password reset flow
- [ ] Two-factor authentication (2FA)
- [ ] Soft delete users (is_active flag)
- [ ] Admin endpoints for user/tutor management
