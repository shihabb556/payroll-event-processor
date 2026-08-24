import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';

import { DatabaseService } from '../../../infrastructure/database/database.service';
import { eventAttempts } from '../../../infrastructure/database/schema/event-attempts.schema';

@Injectable()
export class EventAttemptsRepository {
  constructor(private readonly database: DatabaseService) {}

  async recordAttempt(data: {
    eventId: string;
    attemptNumber: number;
    status: 'SUCCESS' | 'FAILED';
    failureReason?: string;
    completedAt?: Date;
  }) {
    const [attempt] = await this.database.db
      .insert(eventAttempts)
      .values({
        eventId: data.eventId,
        attemptNumber: data.attemptNumber,
        status: data.status,
        failureReason: data.failureReason ?? null,
        completedAt: data.completedAt ?? new Date(),
      })
      .returning();

    return attempt;
  }

  async findByEventId(eventId: string) {
    return this.database.db
      .select()
      .from(eventAttempts)
      .where(eq(eventAttempts.eventId, eventId))
      .orderBy(desc(eventAttempts.attemptNumber));
  }
}
