import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

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
      })
      .returning();

    return event;
  }

  async createWithConflictHandling(data: {
    employeeId: string;
    eventType: EventType;
    idempotencyKey: string;
    payload: Record<string, unknown>;
  }) {
    await this.database.db
      .insert(events)
      .values({
        employeeId: data.employeeId,
        eventType: data.eventType,
        idempotencyKey: data.idempotencyKey,
        payload: data.payload,
        status: 'PENDING',
        attemptCount: 0,
      })
      .onConflictDoNothing();

    return this.findByIdempotencyKey(data.idempotencyKey);
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

  async delete(id: string) {
    await this.database.db.delete(events).where(eq(events.id, id));
  }

  async markProcessing(id: string) {
    const [event] = await this.database.db
      .update(events)
      .set({
        status: 'PROCESSING',
        processingStartedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(events.id, id))
      .returning();

    return event;
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
}
