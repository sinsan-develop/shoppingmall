ALTER TABLE "checkout_orders" ADD COLUMN "paid_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "checkout_orders" DROP CONSTRAINT "checkout_orders_status_ck";
--> statement-breakpoint
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_status_ck"
  CHECK ("status" IN ('PENDING_PAYMENT','EXPIRED','PAID'));
--> statement-breakpoint
ALTER TABLE "checkout_orders" DROP CONSTRAINT "checkout_orders_ended_ck";
--> statement-breakpoint
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_ended_ck"
  CHECK (("status" = 'PENDING_PAYMENT' AND "ended_at" IS NULL AND "paid_at" IS NULL)
    OR ("status" = 'EXPIRED' AND "ended_at" IS NOT NULL AND "paid_at" IS NULL)
    OR ("status" = 'PAID' AND "ended_at" IS NOT NULL AND "paid_at" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "shipment_orders" DROP CONSTRAINT "shipment_orders_status_ck";
--> statement-breakpoint
ALTER TABLE "shipment_orders" ADD CONSTRAINT "shipment_orders_status_ck"
  CHECK ("status" IN ('PENDING_PAYMENT','EXPIRED','PAID'));
--> statement-breakpoint
ALTER TABLE "order_status_events" DROP CONSTRAINT "order_status_events_status_ck";
--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_status_ck"
  CHECK ("status" IN ('PENDING_PAYMENT','EXPIRED','PAID'));
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "checkout_order_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "provider_order_id" text NOT NULL,
  "requested_won" integer NOT NULL,
  "idempotency_key" uuid NOT NULL,
  "request_fingerprint" text NOT NULL,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ended_at" timestamp with time zone,
  CONSTRAINT "payment_attempts_provider_ck" CHECK ("provider" IN ('mock','no_charge')),
  CONSTRAINT "payment_attempts_provider_order_ck" CHECK (length(trim("provider_order_id")) BETWEEN 1 AND 200),
  CONSTRAINT "payment_attempts_requested_ck" CHECK ("requested_won" >= 0),
  CONSTRAINT "payment_attempts_fingerprint_ck" CHECK ("request_fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "payment_attempts_status_ck" CHECK ("status" IN ('PENDING','APPROVED','DECLINED','REVIEW_REQUIRED')),
  CONSTRAINT "payment_attempts_ended_ck" CHECK (("status" = 'PENDING' AND "ended_at" IS NULL)
    OR ("status" <> 'PENDING' AND "ended_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_checkout_fk"
  FOREIGN KEY ("checkout_order_id") REFERENCES "public"."checkout_orders"("id");
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_checkout_key_uq"
  ON "payment_attempts" ("checkout_order_id","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_provider_order_uq"
  ON "payment_attempts" ("provider","provider_order_id");
--> statement-breakpoint
CREATE INDEX "payment_attempts_checkout_created_idx"
  ON "payment_attempts" ("checkout_order_id","created_at");
--> statement-breakpoint
CREATE TABLE "payment_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payment_attempt_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "provider_event_id" text NOT NULL,
  "outcome" text NOT NULL,
  "verified_order_id" uuid NOT NULL,
  "provider_payment_id" text NOT NULL,
  "amount_won" integer NOT NULL,
  "event_fingerprint" text NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processing_status" text DEFAULT 'PENDING_PROCESSING' NOT NULL,
  "processed_at" timestamp with time zone,
  CONSTRAINT "payment_events_provider_ck" CHECK ("provider" IN ('mock','no_charge')),
  CONSTRAINT "payment_events_provider_event_ck" CHECK (length(trim("provider_event_id")) BETWEEN 1 AND 200),
  CONSTRAINT "payment_events_payment_id_ck" CHECK (length(trim("provider_payment_id")) BETWEEN 1 AND 200),
  CONSTRAINT "payment_events_outcome_ck" CHECK ("outcome" IN ('APPROVED','DECLINED')),
  CONSTRAINT "payment_events_amount_ck" CHECK ("amount_won" >= 0),
  CONSTRAINT "payment_events_fingerprint_ck" CHECK ("event_fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "payment_events_processing_ck" CHECK ("processing_status" IN ('PENDING_PROCESSING','APPLIED','REVIEW_REQUIRED')),
  CONSTRAINT "payment_events_processed_ck" CHECK (("processing_status" = 'PENDING_PROCESSING' AND "processed_at" IS NULL)
    OR ("processing_status" <> 'PENDING_PROCESSING' AND "processed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_attempt_fk"
  FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id");
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_uq"
  ON "payment_events" ("provider","provider_event_id");
--> statement-breakpoint
CREATE INDEX "payment_events_attempt_received_idx"
  ON "payment_events" ("payment_attempt_id","received_at");
--> statement-breakpoint
CREATE INDEX "payment_events_pending_idx"
  ON "payment_events" ("processing_status","received_at");
