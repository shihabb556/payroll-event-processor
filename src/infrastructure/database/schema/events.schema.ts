import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const eventTypeEnum = pgEnum('event_type', [
  'BANK_ACCOUNT_CHANGE',
  'ADDRESS_CHANGE',
  'SALARY_CHANGE',
]);

export const eventStatusEnum = pgEnum('event_status', [
  'PENDING',
  'PROCESSING',
  'SUCCESS',
  'FAILED',
]);

export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    employeeId: text('employee_id').notNull(),

    eventType: eventTypeEnum('event_type').notNull(),

    payload: jsonb('payload').notNull(),

    status: eventStatusEnum('status').notNull().default('PENDING'),

    idempotencyKey: text('idempotency_key').notNull(),

    attemptCount: integer('attempt_count').notNull().default(0),

    failureReason: text('failure_reason'),

    result: jsonb('result'),

    processingStartedAt: timestamp('processing_started_at'),

    completedAt: timestamp('completed_at'),

    createdAt: timestamp('created_at').notNull().defaultNow(),

    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    idempotencyKeyUnique: uniqueIndex('events_idempotency_key_unique').on(
      table.idempotencyKey,
    ),
  }),
);
