CREATE TYPE "public"."event_status" AS ENUM('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('BANK_ACCOUNT_CHANGE', 'ADDRESS_CHANGE', 'SALARY_CHANGE');--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" text NOT NULL,
	"event_type" "event_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "event_status" DEFAULT 'PENDING' NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"failure_reason" text,
	"result" jsonb,
	"processing_started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "events_idempotency_key_unique" ON "events" USING btree ("idempotency_key");