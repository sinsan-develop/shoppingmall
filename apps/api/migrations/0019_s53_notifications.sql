CREATE TABLE "notification_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "kind" text NOT NULL,
  "source_event_id" uuid NOT NULL,
  "restock_subscription_id" uuid REFERENCES "restock_subscriptions"("id"),
  "channel" text NOT NULL,
  "dedupe_key" text NOT NULL,
  "status" text DEFAULT 'QUEUED' NOT NULL,
  "attempts_completed" integer DEFAULT 0 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now(),
  "lease_token" uuid,
  "lease_until" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notification_jobs_kind_ck" CHECK ("kind" IN
    ('order_submitted','payment_approved','payment_declined','shipment_updated','restock_available')),
  CONSTRAINT "notification_jobs_channel_ck" CHECK ("channel" IN ('email','sms','push')),
  CONSTRAINT "notification_jobs_status_ck" CHECK ("status" IN ('QUEUED','PROCESSING','SENT','FAILED')),
  CONSTRAINT "notification_jobs_attempts_ck" CHECK ("attempts_completed" BETWEEN 0 AND 3),
  CONSTRAINT "notification_jobs_restock_ck" CHECK (("kind" = 'restock_available') =
    ("restock_subscription_id" IS NOT NULL)),
  CONSTRAINT "notification_jobs_dedupe_key_ck" CHECK (length("dedupe_key") BETWEEN 1 AND 250
    AND "dedupe_key" !~ '[[:space:]@]'),
  CONSTRAINT "notification_jobs_available_ck" CHECK (("status" = 'QUEUED') =
    ("available_at" IS NOT NULL)),
  CONSTRAINT "notification_jobs_lease_ck" CHECK (("status" = 'PROCESSING'
      AND "lease_token" IS NOT NULL AND "lease_until" IS NOT NULL)
    OR ("status" <> 'PROCESSING' AND "lease_token" IS NULL AND "lease_until" IS NULL)),
  CONSTRAINT "notification_jobs_delivered_ck" CHECK (("status" = 'SENT') =
    ("delivered_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_jobs_dedupe_uq" ON "notification_jobs" ("dedupe_key");
--> statement-breakpoint
CREATE INDEX "notification_jobs_due_idx" ON "notification_jobs" ("status","available_at");
--> statement-breakpoint
CREATE INDEX "notification_jobs_account_idx" ON "notification_jobs" ("account_id","created_at");
--> statement-breakpoint
CREATE TABLE "notification_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "notification_jobs"("id"),
  "attempt_no" integer NOT NULL,
  "status" text DEFAULT 'STARTED' NOT NULL,
  "error_code" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  CONSTRAINT "notification_attempts_no_ck" CHECK ("attempt_no" BETWEEN 1 AND 3),
  CONSTRAINT "notification_attempts_status_ck" CHECK ("status" IN
    ('STARTED','SUCCEEDED','TRANSIENT_FAILURE','PERMANENT_FAILURE')),
  CONSTRAINT "notification_attempts_error_code_ck" CHECK ("error_code" IS NULL
    OR "error_code" ~ '^[A-Z0-9_]{1,80}$'),
  CONSTRAINT "notification_attempts_result_ck" CHECK (("status" = 'STARTED'
      AND "finished_at" IS NULL AND "error_code" IS NULL)
    OR ("status" = 'SUCCEEDED' AND "finished_at" IS NOT NULL AND "error_code" IS NULL)
    OR ("status" IN ('TRANSIENT_FAILURE','PERMANENT_FAILURE')
      AND "finished_at" IS NOT NULL AND "error_code" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_attempts_job_no_uq"
  ON "notification_attempts" ("job_id","attempt_no");
