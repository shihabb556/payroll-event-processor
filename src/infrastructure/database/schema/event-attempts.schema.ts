import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { events } from './events.schema';

export const attemptStatusEnum = pgEnum('attempt_status', [
  'SUCCESS',
  'FAILED',
]);

export const eventAttempts = pgTable(
  'event_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    attemptNumber: integer('attempt_number').notNull(),
    status: attemptStatusEnum('status').notNull(),
    failureReason: text('failure_reason'),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    eventAttemptUnique: uniqueIndex(
      'event_attempts_event_id_attempt_number_unique',
    ).on(table.eventId, table.attemptNumber),
  }),
);
