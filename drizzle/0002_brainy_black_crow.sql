CREATE TABLE "employee_sequences" (
	"employee_id" text PRIMARY KEY NOT NULL,
	"next_sequence" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "events_employee_sequence_unique" ON "events" USING btree ("employee_id","sequence");--> statement-breakpoint
CREATE INDEX "events_employee_status_idx" ON "events" USING btree ("employee_id","status");