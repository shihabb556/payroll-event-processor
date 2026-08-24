CREATE TYPE "public"."attempt_status" AS ENUM('SUCCESS', 'FAILED');--> statement-breakpoint
CREATE TABLE "event_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "attempt_status" NOT NULL,
	"failure_reason" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_attempts" ADD CONSTRAINT "event_attempts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;