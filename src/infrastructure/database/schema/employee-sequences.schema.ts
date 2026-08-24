import { integer, pgTable, text } from 'drizzle-orm/pg-core';

export const employeeSequences = pgTable('employee_sequences', {
  employeeId: text('employee_id').primaryKey(),
  nextSequence: integer('next_sequence').notNull().default(1),
});
