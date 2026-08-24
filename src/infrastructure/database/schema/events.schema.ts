import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  uniqueIndex,
  index,
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

    sequence: integer('sequence').notNull().default(0),

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
    employeeSequenceIndex: uniqueIndex('events_employee_sequence_unique').on(
      table.employeeId,
      table.sequence,
    ),
    employeeStatusIndex: index('events_employee_status_idx').on(
      table.employeeId,
      table.status,
    ),
    processingStartedAtIndex: index('events_processing_started_at_idx').on(
      table.processingStartedAt,
    ),
    statusProcessingIndex: index('events_status_processing_idx').on(
      table.status,
      table.processingStartedAt,
    ),
  }),
);
