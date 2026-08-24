# Payroll Event Processor

An event-driven payroll processing system built with NestJS, PostgreSQL, Redis, and BullMQ. Processes employee payroll events (salary changes, address changes, bank account changes) with per-employee ordering, idempotency, retry logic, and crash recovery.

## Architecture Overview

```
POST /api/v1/events
        │
        ▼
   Validation (class-validator)
        │
        ▼
   Idempotency Check (idempotency_key unique constraint)
        │
        ▼
   Sequence Assignment (per-employee atomic counter)
        │
        ▼
   PostgreSQL (events table)
        │
        ▼
   BullMQ Queue (payroll-events)
        │
        ▼
   Redis (job broker)
        │
        ▼
   Worker (PayrollEventProcessor)
        │
        ▼
   Event Handler (per event type)
        │
        ▼
   Processing + Status Update (PostgreSQL)
```

## Technology Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: NestJS
- **Database**: PostgreSQL 16 (via Drizzle ORM + postgres.js)
- **Queue**: BullMQ (backed by Redis)
- **Cache/Broker**: Redis 7
- **Validation**: class-validator + class-transformer
- **Testing**: Jest

## Prerequisites

- Node.js >= 20
- pnpm
- Docker & Docker Compose

## Environment Variables

Create a `.env` file:

```bash
# PostgreSQL
DATABASE_URL=postgresql://payroll:payroll@localhost:5432/payroll

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Application
PORT=3000

# Queue (optional, defaults shown)
QUEUE_NAME=payroll-events
WORKER_CONCURRENCY=5

# Recovery (optional, defaults shown)
EVENT_PROCESSING_TIMEOUT_MS=60000
RECOVERY_INTERVAL_MS=30000
RECOVERY_BATCH_SIZE=10
```

## Getting Started

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Run database migrations
pnpm db-migrate

# 4. Start the application
pnpm start:dev
```

## Database Migrations

```bash
# Generate migrations after schema changes
pnpm db-generate

# Apply pending migrations
pnpm db-migrate

# Open Drizzle Studio (visual DB browser)
pnpm db-studio
```

## API Endpoints

### Create Event

```bash
POST /api/v1/events
Content-Type: application/json
```

```json
{
  "employeeId": "EMP-001",
  "eventType": "SALARY_CHANGE",
  "idempotencyKey": "salary-change-emp001-20260101",
  "payload": {
    "salary": 75000
  }
}
```

**Response (201 Created):**
```json
{
  "message": "Event created successfully",
  "event": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "employeeId": "EMP-001",
    "eventType": "SALARY_CHANGE",
    "status": "PENDING",
    "sequence": 1,
    "idempotencyKey": "salary-change-emp001-20260101",
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

**Idempotent Response (201 Created):** Returns the existing event if the same `idempotencyKey` is used.

### Get Event

```bash
GET /api/v1/events/:id
```

**Response (200 OK):**
```json
{
  "event": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "employeeId": "EMP-001",
    "eventType": "SALARY_CHANGE",
    "status": "SUCCESS",
    "sequence": 1,
    "idempotencyKey": "salary-change-emp001-20260101",
    "payload": { "salary": 75000 },
    "attemptCount": 1,
    "failureReason": null,
    "result": { "success": true, "message": "Salary updated", "data": { "salary": 75000 } },
    "processingStartedAt": "2026-01-01T00:00:00.100Z",
    "completedAt": "2026-01-01T00:00:00.200Z",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.200Z",
    "attempts": [
      { "attemptNumber": 1, "status": "SUCCESS", "failureReason": null, "startedAt": "...", "completedAt": "..." }
    ]
  }
}
```

### Health Check

```bash
GET /api/v1/health
```

```json
{
  "status": "ok",
  "services": {
    "database": "connected",
    "redis": "connected"
  },
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

## Event Types

| Event Type | Description | Payload Fields |
|---|---|---|
| `SALARY_CHANGE` | Update employee salary | `salary: number` |
| `ADDRESS_CHANGE` | Update employee address | `street, city, state, zip: string` |
| `BANK_ACCOUNT_CHANGE` | Update employee bank account | `accountNumber, routingNumber, bankName: string` |

## Queue / Worker Architecture

- **Queue**: BullMQ queue named `payroll-events`
- **Worker**: `PayrollEventProcessor` processes jobs with configurable concurrency (default: 5)
- **Job Lifecycle**: `PENDING → PROCESSING → SUCCESS | FAILED`
- **Attempt Tracking**: Each processing attempt is recorded in the `event_attempts` table

## Retry Behavior

BullMQ retries failed jobs with exponential backoff:

- **Max attempts**: 3
- **Backoff**: Exponential, starting at 1s (1s, 2s, 4s)
- **Temporary failures** (thrown errors): Retried by BullMQ
- **Permanent failures** (returned `success: false` or `PermanentProcessingError`): Marked `FAILED` immediately, no retry

## Idempotency Behavior

- **Database constraint**: `idempotency_key` has a unique index on the `events` table
- **Fast path**: Service checks for existing event by `idempotencyKey` before creating
- **Race safety**: Concurrent requests with the same key hit the unique constraint; the duplicate is caught and the existing event is returned
- **Worker idempotency**: If a job is re-executed for an already-SUCCESS event, processing is skipped

## Per-Employee Ordering

- **Sequence allocation**: Each event for an employee gets a monotonically increasing `sequence` number via the `employee_sequences` table
- **Atomic allocation**: Uses `INSERT ON CONFLICT` + `UPDATE ... RETURNING` to prevent race conditions
- **Enforcement**: Before processing, the worker checks if all earlier events for the same employee are in a terminal state (SUCCESS or FAILED)
- **Blocking**: If earlier events are still pending/processing, the worker throws a temporary error and BullMQ retries later
- **Cross-employee concurrency**: Different employees are processed independently; no global serialization

## Worker Crash Recovery

The `StuckEventRecoveryService` runs on a configurable interval (default: 30s):

1. Queries for events in `PROCESSING` state whose `processing_started_at` exceeds the timeout (default: 60s)
2. Atomically recovers stale events back to `PENDING`
3. The event is then picked up by the worker again

This prevents permanent `PROCESSING` states from worker crashes.

## Running Tests

```bash
# Unit tests
pnpm test

# Test coverage
pnpm test:cov

# Watch mode
pnpm test:watch
```

## Project Structure

```
src/
├── common/
│   ├── errors/           # Custom error classes
│   └── filters/          # Exception filters
├── config/               # Configuration
├── infrastructure/
│   ├── database/         # Drizzle ORM, schema, migrations
│   ├── redis/            # Redis connection
│   └── queue/            # BullMQ queue setup
├── modules/
│   ├── events/           # Event API, service, repositories, recovery
│   └── health/           # Health check endpoint
├── workers/
│   ├── handlers/         # Event type handlers
│   ├── payroll-event.processor.ts  # BullMQ worker
│   └── worker.module.ts
├── app.module.ts
└── main.ts
```

## License

UNLICENSED
