import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { DatabaseService } from '../../../infrastructure/database/database.service';
import { employeeSequences } from '../../../infrastructure/database/schema/employee-sequences.schema';

@Injectable()
export class EmployeeSequencesRepository {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Allocate the next sequence number for an employee atomically.
   * Uses INSERT ON CONFLICT + UPDATE to handle concurrent allocations.
   * Returns the allocated sequence number (starting from 1).
   */
  async allocateSequence(employeeId: string): Promise<number> {
    // Ensure the employee row exists (first event for this employee)
    await this.database.db
      .insert(employeeSequences)
      .values({ employeeId, nextSequence: 1 })
      .onConflictDoNothing();

    // Atomically increment and return the old value (the allocated sequence)
    // PostgreSQL UPDATE ... RETURNING returns the NEW values,
    // so we subtract 1 to get the allocated sequence.
    const [result] = await this.database.db
      .update(employeeSequences)
      .set({
        nextSequence: sql`${employeeSequences.nextSequence} + 1`,
      })
      .where(eq(employeeSequences.employeeId, employeeId))
      .returning();

    // result.nextSequence is the NEW value (after increment)
    // The allocated sequence is nextSequence - 1
    return (result?.nextSequence ?? 1) - 1;
  }
}
