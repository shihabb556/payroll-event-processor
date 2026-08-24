# Payroll Event Processing Service

A production-oriented backend service for processing employee payroll events asynchronously. Built with NestJS, PostgreSQL, Redis, and BullMQ.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────┐     ┌──────────┐
│   Frontend   │────▶│  NestJS API  │────▶│ Postgres │     │  Redis   │
│ (HTML/JS)   │     │  POST/GET    │     │ (Drizzle)│     │ (BullMQ) │
└─────────────┘     └──────┬───────┘     └──────────┘     └─────┬────┘
                           │                                     │
                           │ enqueue                             │
                           ▼                                     │
                    ┌──────────────┐                             │
                    │   BullMQ     │◀────────────────────────────┘
                    │    Queue     │         fetch jobs
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐     ┌──────────┐
                    │   Worker     │────▶│ Postgres │
                    │ (Processor)  │     │ (update) │
                    └──────┬───────┘     └──────────┘
                           │
                    ┌──────▼───────┐
                    │   Handler    │
                    │ (per type)   │
                    └──────────────┘
```

### Data Flow

1. **Frontend** submits event via `POST /api/v1/events`
2. **API** validates request + payload, checks idempotency, persists event, enqueues BullMQ job
3. **BullMQ** stores job in Redis, delivers to available worker
4. **Worker** claims event (PENDING → PROCESSING), checks ordering constraints, calls handler
5. **Handler** processes the event (simulated payroll operation)
6. **Worker** updates event status (SUCCESS or FAILED) and records attempt history
7. **Frontend** polls `GET /api/v1/events` to observe state changes

## Technology Stack

- **Runtime**: Node.js 22 + TypeScript
- **Framework**: NestJS
- **Database**: PostgreSQL 16 (via Drizzle ORM)
- **Queue**: BullMQ (backed by Redis 7)
- **Validation**: class-validator + class-transformer
- **API Docs**: Swagger / OpenAPI
- **Testing**: Jest
- **Containerization**: Docker + Docker Compose

## Prerequisites

- Node.js >= 20
- pnpm
- Docker & Docker Compose (for containerized setup)

## Getting Started

### Quick Start with Docker

```bash
# Start everything (PostgreSQL, Redis, API, Worker)
docker compose up -d

# Run database migrations
docker compose exec api pnpm db-migrate

# Open in browser
# Frontend:  http://localhost:3000
# API Docs:  http://localhost:3000/api-docs
# Health:    http://localhost:3000/api/v1/health
```

### Local Development

```bash
# 1. Start infrastructure
docker compose up -d postgres redis

# 2. Install dependencies
pnpm install

# 3. Create .env file
cp .env.example .env   # or create manually

# 4. Run migrations
pnpm db-migrate

# 5. Start API + Worker (same process for dev)
pnpm start:dev
```

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://payroll:payroll@localhost:5432/payroll
REDIS_HOST=localhost
REDIS_PORT=6379

# Optional
PORT=3000
QUEUE_NAME=payroll-events
WORKER_CONCURRENCY=5
EVENT_PROCESSING_TIMEOUT_MS=60000
RECOVERY_INTERVAL_MS=30000
RECOVERY_BATCH_SIZE=10
```

## API Endpoints

### POST /api/v1/events — Submit Event

```bash
curl -X POST http://localhost:3000/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "EMP-001",
    "eventType": "SALARY_CHANGE",
    "idempotencyKey": "salary-emp001-20260101",
    "payload": {
      "effectiveDate": "2026-01-15",
      "newSalary": 75000,
      "currency": "USD"
    }
  }'
```

**Response (201):**
```json
{
  "message": "Event created successfully",
  "event": {
    "id": "550e8400-...",
    "employeeId": "EMP-001",
    "eventType": "SALARY_CHANGE",
    "status": "PENDING",
    "sequence": 1,
    "idempotencyKey": "salary-emp001-20260101",
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

**Idempotent:** Same `idempotencyKey` returns existing event without creating a duplicate.

### GET /api/v1/events — List Events

```bash
curl http://localhost:3000/api/v1/events
```

### GET /api/v1/events/:id — Get Event Details

```bash
curl http://localhost:3000/api/v1/events/550e8400-...
```

Includes full event data plus attempt history.

### GET /api/v1/health — Health Check

```bash
curl http://localhost:3000/api/v1/health
```

```json
{
  "status": "ok",
  "services": { "database": "connected", "redis": "connected" },
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

### Swagger / OpenAPI

Available at: `http://localhost:3000/api-docs`

## Event Types

### SALARY_CHANGE

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| effectiveDate | string | yes | ISO date when change takes effect |
| newSalary | number | yes | New salary amount |
| currency | string | yes | Currency code (ISO 4217) |

### ADDRESS_CHANGE

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| effectiveDate | string | yes | ISO date when change takes effect |
| street | string | yes | Street address |
| city | string | yes | City |
| postalCode | string | yes | Postal code |
| country | string | yes | Country |

### BANK_ACCOUNT_CHANGE

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| effectiveDate | string | yes | ISO date when change takes effect |
| iban | string | yes | International Bank Account Number |

## Database Design

### Tables

**events** — Core event record
- `id` (UUID, PK) — Unique event identifier
- `employee_id` (text) — Employee identifier
- `event_type` (enum) — BANK_ACCOUNT_CHANGE, ADDRESS_CHANGE, SALARY_CHANGE
- `status` (enum) — PENDING, PROCESSING, SUCCESS, FAILED
- `idempotency_key` (text, unique) — Client-provided deduplication key
- `sequence` (integer) — Per-employee ordering counter
- `payload` (jsonb) — Event-type-specific data
- `result` (jsonb) — Processing result
- `failure_reason` (text) — Error message on failure
- `attempt_count` (integer) — Number of processing attempts
- `processing_started_at` (timestamp) — When processing began
- `completed_at` (timestamp) — When processing finished
- `created_at`, `updated_at` (timestamps)

**event_attempts** — Per-attempt audit trail
- `id` (UUID, PK)
- `event_id` (UUID, FK → events.id, CASCADE)
- `attempt_number` (integer)
- `status` (enum) — SUCCESS, FAILED
- `failure_reason` (text)
- `started_at`, `completed_at`, `created_at` (timestamps)

**employee_sequences** — Per-employee sequence counter
- `employee_id` (text, PK)
- `next_sequence` (integer, default 1)

### Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `events_idempotency_key_unique` | idempotency_key | Idempotency enforcement |
| `events_employee_sequence_unique` | employee_id, sequence | Per-employee ordering |
| `events_employee_status_idx` | employee_id, status | Ordering constraint queries |
| `events_status_processing_idx` | status, processing_started_at | Stale event recovery |
| `events_processing_started_at_idx` | processing_started_at | Recovery queries |

## Queue / Worker Architecture

- **Queue**: BullMQ `payroll-events`
- **Job**: `process-payroll-event` with `{ eventId }` payload
- **Concurrency**: Configurable via `WORKER_CONCURRENCY` (default: 5)
- **Retry**: 3 attempts, exponential backoff (1s, 2s, 4s)
- **Cleanup**: Completed jobs removed after 1 hour (max 1000); failed jobs after 24 hours (max 5000)

### Processing Flow

```
Job received
  → Load event from DB
  → Check idempotency (skip if SUCCESS/FAILED)
  → Check ordering (defer if prior events pending)
  → Claim event (PENDING → PROCESSING)
  → Increment attempt count
  → Record attempt start
  → Resolve handler by event type
  → Execute handler.process()
  → Mark SUCCESS or FAILED
  → Record attempt result
```

## Key Design Decisions

### Idempotency

**Client-provided `idempotencyKey`** with database unique constraint.

When the same key is submitted twice, the second request returns the existing event without creating a duplicate. This also handles concurrent duplicate requests (race condition safety via the unique constraint).

The client is responsible for generating meaningful idempotency keys (e.g., `{employeeId}-{eventType}-{timestamp}`).

### Per-Employee Ordering

Events for the same employee are processed in sequence order. Before processing event N, the worker checks that all events 1..N-1 for that employee are in a terminal state (SUCCESS or FAILED).

If earlier events are still pending/processing, the worker throws a temporary error. BullMQ retries with backoff until the ordering constraint is satisfied.

Events for **different employees** process concurrently — there is no global serialization.

### Worker Crash Recovery

`StuckEventRecoveryService` runs on a configurable interval (default: 30s):

1. Queries for events stuck in `PROCESSING` state beyond a timeout (default: 60s)
2. Atomically recovers them to `PENDING` (only if still PROCESSING and timeout exceeded)
3. The events re-enter the worker queue for reprocessing

This prevents permanent `PROCESSING` states from worker crashes.

### Processing Consistency

When a worker processes an event:
1. Handler executes the business logic
2. Status is updated atomically (single UPDATE query)

If the worker crashes between handler execution and status update, the event remains `PROCESSING` and is recovered. For simulated handlers (this assignment), re-execution is safe. A production system would add handler-level idempotency (e.g., check external system state or pass the `idempotencyKey` to the external API).

### Payload Validation

Each event type has a dedicated DTO with class-validator decorators. The `CreateEventDto` accepts a generic `payload` object, and `validateEventPayload()` dynamically validates it against the correct DTO based on `eventType`. Invalid payloads return 400 with specific field error messages.

## Running Tests

```bash
# Unit tests
pnpm test

# Test coverage
pnpm test:cov

# Watch mode
pnpm test:watch
```

### Test Coverage

| Area | Tests | What's Tested |
|------|-------|---------------|
| Handlers (×3) | 12 | Success, temporary failure, permanent failure, event type |
| Event resolver | 5 | Handler resolution, unknown type, supported types |
| Processor | 15+ | Claim, reclaim, idempotency, ordering, temp/permanent failure, attempt tracking |
| Events service | 5 | Create, duplicate key, queue failure, unique violation, get 404 |
| Repository | 3 | Stale detection, atomic recovery, ineligible recovery |
| Recovery service | 14 | Detection, recovery, batching, concurrency, config |

## Project Structure

```
src/
├── common/
│   ├── errors/              # PermanentProcessingError, TemporaryProcessingError
│   └── filters/             # AllExceptionsFilter (prevents stack trace leaks)
├── infrastructure/
│   ├── database/            # Drizzle ORM, schema, migrations
│   ├── redis/               # ioredis connection
│   └── queue/               # BullMQ queue setup
├── modules/
│   ├── events/              # Event API, service, repositories, DTOs, recovery
│   └── health/              # Health check endpoint
├── workers/
│   ├── handlers/            # Event type handlers (strategy pattern)
│   ├── payroll-event.processor.ts  # BullMQ worker
│   └── worker.module.ts
├── app.module.ts            # API application module
├── worker-app.module.ts     # Worker-only module (for separate process)
├── main.ts                  # API entry point
└── main-worker.ts           # Worker-only entry point
```

## Docker Architecture

`docker compose up` starts 4 services:

| Service | Description | Port |
|---------|-------------|------|
| postgres | PostgreSQL 16 | 5432 |
| redis | Redis 7 | 6379 |
| api | NestJS API + static frontend | 3000 |
| worker | BullMQ worker process | — |

API and worker share the same Docker image but run different entry points:
- **API**: `node dist/main.js` — serves HTTP, Swagger, and frontend
- **Worker**: `node dist/main-worker.js` — processes BullMQ jobs only

## License

UNLICENSED
