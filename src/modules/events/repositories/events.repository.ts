import { Injectable } from '@nestjs/common';
import { and, eq, lt, sql } from 'drizzle-orm';

import { DatabaseService } from '../../../infrastructure/database/database.service';
import { events } from '../../../infrastructure/database/schema/events.schema';
import { EventType } from '../types/event-payload.types';

@Injectable()
export class EventsRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(data: {
    employeeId: string;
    eventType: EventType;
    idempotencyKey: string;
    payload: Record<string, unknown>;
    sequence: number;
  }) {
    const [event] = await this.database.db
      .insert(events)
      .values({
        employeeId: data.employeeId,
        eventType: data.eventType,
        idempotencyKey: data.idempotencyKey,
        payload: data.payload,
        status: 'PENDING',
        attemptCount: 0,
        sequence: data.sequence,
      })
      .returning();

    return event;
  }

  async findById(id: string) {
    const [event] = await this.database.db
      .select()
      .from(events)
      .where(eq(events.id, id))
      .limit(1);

    return event;
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    const [event] = await this.database.db
      .select()
      .from(events)
      .where(eq(events.idempotencyKey, idempotencyKey))
      .limit(1);

    return event;
  }

  /**
   * Atomically claim an event for processing.
   * Transitions PENDING → PROCESSING.
   * Returns the event if claim succeeded, null if already claimed.
   */
  async claimEvent(id: string) {
    const [event] = await this.database.db
      .update(events)
      .set({
        status: 'PROCESSING',
        processingStartedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(events.id, id), eq(events.status, 'PENDING')))
      .returning();

    return event ?? null;
  }

  /**
   * Re-claim an event that is already PROCESSING (for retries).
   * Updates the processing timestamp.
   */
  async reClaimEvent(id: string) {
    const [event] = await this.database.db
      .update(events)
      .set({
        processingStartedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(events.id, id), eq(events.status, 'PROCESSING')))
      .returning();

    return event ?? null;
  }

  async markSuccess(id: string, result: Record<string, unknown>) {
    const [event] = await this.database.db
      .update(events)
      .set({
        status: 'SUCCESS',
        result,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(events.id, id))
      .returning();

    return event;
  }

  async markFailed(id: string, failureReason: string) {
    const [event] = await this.database.db
      .update(events)
      .set({
        status: 'FAILED',
        failureReason,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(events.id, id))
      .returning();

    return event;
  }

  async incrementAttemptCount(id: string) {
    const [event] = await this.database.db
      .update(events)
      .set({
        attemptCount: sql`${events.attemptCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(events.id, id))
      .returning();

    return event;
  }

  async delete(id: string) {
    await this.database.db.delete(events).where(eq(events.id, id));
  }

  /**
   * Check if there are any unprocessed prior events for the same employee.
   * "Unprocessed" means events with sequence < this sequence that are
   * not in a terminal state (SUCCESS or FAILED).
   *
   * Returns true if earlier events are still pending/processing (ordering blocked).
   * Returns false if all earlier events are done (safe to process).
   */
  async hasUnprocessedPriorEvents(
    employeeId: string,
    sequence: number,
  ): Promise<boolean> {
    const [row] = await this.database.db
      .select({ count: sql<number>`count(*)::int` })
      .from(events)
      .where(
        and(
          eq(events.employeeId, employeeId),
          lt(events.sequence, sequence),
          sql`${events.status} NOT IN ('SUCCESS', 'FAILED')`,
        ),
      )
      .limit(1);

    return (row?.count ?? 0) > 0;
  }
}
