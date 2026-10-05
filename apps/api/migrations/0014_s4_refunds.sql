CREATE TABLE "refund_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "checkout_order_id" uuid NOT NULL,
  "shipment_order_id" uuid NOT NULL,
  "requester_account_id" uuid NOT NULL,
  "requester_role" text NOT NULL,
  "reason_code" text NOT NULL,
  "reason" text NOT NULL,
  "pre_shipment_evidence" text,
  "pre_shipment_confirmed_by" uuid,
  "pre_shipment_confirmed_at" timestamp with time zone,
  "policy_code" text DEFAULT 'PRE_SHIPMENT_V1' NOT NULL,
  "policy_version" integer DEFAULT 1 NOT NULL,
  "idempotency_key" uuid NOT NULL,
  "request_fingerprint" text NOT NULL,
  "goods_refund_won" integer DEFAULT 0 NOT NULL,
  "shipping_refund_won" integer DEFAULT 0 NOT NULL,
  "total_refund_won" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'REQUESTED' NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "decided_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "decision_by" uuid,
  "decision_reason" text,
  CONSTRAINT "refund_cases_requester_role_ck" CHECK ("requester_role" IN ('customer','admin')),
  CONSTRAINT "refund_cases_reason_code_ck" CHECK ("reason_code" IN
    ('customer_request','quality_issue','wrong_delivery','damaged','other')),
  CONSTRAINT "refund_cases_reason_ck" CHECK (length(trim("reason")) BETWEEN 1 AND 500),
  CONSTRAINT "refund_cases_evidence_ck" CHECK ("pre_shipment_evidence" IS NULL
    OR "pre_shipment_evidence" = 'ADMIN_CONFIRMED_NOT_DISPATCHED'),
  CONSTRAINT "refund_cases_policy_ck" CHECK (length(trim("policy_code")) BETWEEN 1 AND 100
    AND "policy_version" > 0),
  CONSTRAINT "refund_cases_fingerprint_ck" CHECK ("request_fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "refund_cases_amount_ck" CHECK ("goods_refund_won" >= 0
    AND "shipping_refund_won" >= 0
    AND "total_refund_won" = "goods_refund_won" + "shipping_refund_won"),
  CONSTRAINT "refund_cases_status_ck" CHECK ("status" IN
    ('REQUESTED','APPROVED','REJECTED','PROCESSING','REFUNDED','REVIEW_REQUIRED')),
  CONSTRAINT "refund_cases_decision_reason_ck" CHECK ("decision_reason" IS NULL
    OR length(trim("decision_reason")) BETWEEN 1 AND 500),
  CONSTRAINT "refund_cases_state_ck" CHECK (
    ("status" = 'REQUESTED' AND "decided_at" IS NULL AND "completed_at" IS NULL
      AND "decision_by" IS NULL AND "decision_reason" IS NULL
      AND "pre_shipment_evidence" IS NULL AND "pre_shipment_confirmed_by" IS NULL
      AND "pre_shipment_confirmed_at" IS NULL
      AND "goods_refund_won" = 0 AND "shipping_refund_won" = 0 AND "total_refund_won" = 0)
    OR ("status" IN ('APPROVED','PROCESSING') AND "decided_at" IS NOT NULL
      AND "completed_at" IS NULL AND "decision_by" IS NOT NULL AND "decision_reason" IS NOT NULL
      AND "pre_shipment_evidence" = 'ADMIN_CONFIRMED_NOT_DISPATCHED'
      AND "pre_shipment_confirmed_by" IS NOT NULL AND "pre_shipment_confirmed_at" IS NOT NULL)
    OR ("status" = 'REJECTED' AND "decided_at" IS NOT NULL AND "completed_at" IS NOT NULL
      AND "decision_by" IS NOT NULL AND "decision_reason" IS NOT NULL
      AND "goods_refund_won" = 0 AND "shipping_refund_won" = 0 AND "total_refund_won" = 0)
    OR ("status" = 'REFUNDED' AND "decided_at" IS NOT NULL
      AND "completed_at" IS NOT NULL AND "decision_by" IS NOT NULL AND "decision_reason" IS NOT NULL
      AND "pre_shipment_evidence" = 'ADMIN_CONFIRMED_NOT_DISPATCHED'
      AND "pre_shipment_confirmed_by" IS NOT NULL AND "pre_shipment_confirmed_at" IS NOT NULL)
    OR ("status" = 'REVIEW_REQUIRED' AND "decided_at" IS NOT NULL
      AND "completed_at" IS NULL AND "decision_by" IS NOT NULL AND "decision_reason" IS NOT NULL
      AND "pre_shipment_evidence" = 'ADMIN_CONFIRMED_NOT_DISPATCHED'
      AND "pre_shipment_confirmed_by" IS NOT NULL AND "pre_shipment_confirmed_at" IS NOT NULL)
  )
);
--> statement-breakpoint
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_checkout_fk"
  FOREIGN KEY ("checkout_order_id") REFERENCES "public"."checkout_orders"("id");
--> statement-breakpoint
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_shipment_fk"
  FOREIGN KEY ("checkout_order_id","shipment_order_id")
  REFERENCES "public"."shipment_orders"("checkout_order_id","id");
--> statement-breakpoint
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_requester_fk"
  FOREIGN KEY ("requester_account_id") REFERENCES "public"."accounts"("id");
--> statement-breakpoint
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_confirmed_by_fk"
  FOREIGN KEY ("pre_shipment_confirmed_by") REFERENCES "public"."accounts"("id");
--> statement-breakpoint
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_decision_by_fk"
  FOREIGN KEY ("decision_by") REFERENCES "public"."accounts"("id");
--> statement-breakpoint
CREATE UNIQUE INDEX "refund_cases_request_key_uq"
  ON "refund_cases" ("requester_account_id","checkout_order_id","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "refund_cases_id_shipment_uq"
  ON "refund_cases" ("id","shipment_order_id");
--> statement-breakpoint
CREATE INDEX "refund_cases_checkout_requested_idx"
  ON "refund_cases" ("checkout_order_id","requested_at");
--> statement-breakpoint
CREATE INDEX "refund_cases_status_requested_idx"
  ON "refund_cases" ("status","requested_at");
--> statement-breakpoint
CREATE TABLE "refund_case_lines" (
  "refund_case_id" uuid NOT NULL,
  "shipment_order_id" uuid NOT NULL,
  "option_id" uuid NOT NULL,
  "quantity" integer NOT NULL,
  "goods_refund_won" integer DEFAULT 0 NOT NULL,
  "restock_mode" text DEFAULT 'none' NOT NULL,
  "restocked_quantity" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "refund_case_lines_pk" PRIMARY KEY ("refund_case_id","option_id"),
  CONSTRAINT "refund_case_lines_quantity_ck" CHECK ("quantity" > 0),
  CONSTRAINT "refund_case_lines_money_ck" CHECK ("goods_refund_won" >= 0),
  CONSTRAINT "refund_case_lines_restock_ck" CHECK (
    ("restock_mode" = 'none' AND "restocked_quantity" = 0)
    OR ("restock_mode" = 'on_hand_only'
      AND "restocked_quantity" BETWEEN 0 AND "quantity"))
);
--> statement-breakpoint
ALTER TABLE "refund_case_lines" ADD CONSTRAINT "refund_case_lines_case_fk"
  FOREIGN KEY ("refund_case_id","shipment_order_id")
  REFERENCES "public"."refund_cases"("id","shipment_order_id");
--> statement-breakpoint
ALTER TABLE "refund_case_lines" ADD CONSTRAINT "refund_case_lines_order_line_fk"
  FOREIGN KEY ("shipment_order_id","option_id")
  REFERENCES "public"."shipment_order_lines"("shipment_order_id","option_id");
--> statement-breakpoint
CREATE INDEX "refund_case_lines_option_idx" ON "refund_case_lines" ("option_id");
--> statement-breakpoint
CREATE TABLE "refund_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "refund_case_id" uuid NOT NULL,
  "payment_attempt_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "provider_refund_id" text NOT NULL,
  "requested_won" integer NOT NULL,
  "idempotency_key" uuid NOT NULL,
  "request_fingerprint" text NOT NULL,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ended_at" timestamp with time zone,
  CONSTRAINT "refund_attempts_provider_ck" CHECK ("provider" IN ('mock','no_charge')),
  CONSTRAINT "refund_attempts_provider_id_ck" CHECK
    (length(trim("provider_refund_id")) BETWEEN 1 AND 200),
  CONSTRAINT "refund_attempts_requested_ck" CHECK ("requested_won" >= 0),
  CONSTRAINT "refund_attempts_fingerprint_ck" CHECK ("request_fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "refund_attempts_status_ck" CHECK
    ("status" IN ('PENDING','SUCCEEDED','FAILED','REVIEW_REQUIRED')),
  CONSTRAINT "refund_attempts_ended_ck" CHECK (
    ("status" = 'PENDING' AND "ended_at" IS NULL)
    OR ("status" <> 'PENDING' AND "ended_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "refund_attempts" ADD CONSTRAINT "refund_attempts_case_fk"
  FOREIGN KEY ("refund_case_id") REFERENCES "public"."refund_cases"("id");
--> statement-breakpoint
ALTER TABLE "refund_attempts" ADD CONSTRAINT "refund_attempts_payment_fk"
  FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id");
--> statement-breakpoint
CREATE UNIQUE INDEX "refund_attempts_case_key_uq"
  ON "refund_attempts" ("refund_case_id","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "refund_attempts_provider_refund_uq"
  ON "refund_attempts" ("provider","provider_refund_id");
--> statement-breakpoint
CREATE INDEX "refund_attempts_case_created_idx"
  ON "refund_attempts" ("refund_case_id","created_at");
--> statement-breakpoint
CREATE TABLE "refund_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "refund_attempt_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "provider_event_id" text NOT NULL,
  "outcome" text NOT NULL,
  "verified_order_id" uuid NOT NULL,
  "provider_payment_id" text NOT NULL,
  "provider_refund_id" text NOT NULL,
  "amount_won" integer NOT NULL,
  "event_fingerprint" text NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processing_status" text DEFAULT 'PENDING_PROCESSING' NOT NULL,
  "processed_at" timestamp with time zone,
  CONSTRAINT "refund_events_provider_ck" CHECK ("provider" IN ('mock','no_charge')),
  CONSTRAINT "refund_events_ids_ck" CHECK
    (length(trim("provider_event_id")) BETWEEN 1 AND 200
      AND length(trim("provider_payment_id")) BETWEEN 1 AND 200
      AND length(trim("provider_refund_id")) BETWEEN 1 AND 200),
  CONSTRAINT "refund_events_outcome_ck" CHECK ("outcome" IN ('SUCCEEDED','FAILED')),
  CONSTRAINT "refund_events_amount_ck" CHECK ("amount_won" >= 0),
  CONSTRAINT "refund_events_fingerprint_ck" CHECK ("event_fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "refund_events_processing_ck" CHECK
    ("processing_status" IN ('PENDING_PROCESSING','APPLIED','REVIEW_REQUIRED')),
  CONSTRAINT "refund_events_processed_ck" CHECK (
    ("processing_status" = 'PENDING_PROCESSING' AND "processed_at" IS NULL)
    OR ("processing_status" <> 'PENDING_PROCESSING' AND "processed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "refund_events" ADD CONSTRAINT "refund_events_attempt_fk"
  FOREIGN KEY ("refund_attempt_id") REFERENCES "public"."refund_attempts"("id");
--> statement-breakpoint
ALTER TABLE "refund_events" ADD CONSTRAINT "refund_events_order_fk"
  FOREIGN KEY ("verified_order_id") REFERENCES "public"."checkout_orders"("id");
--> statement-breakpoint
CREATE UNIQUE INDEX "refund_events_provider_event_uq"
  ON "refund_events" ("provider","provider_event_id");
--> statement-breakpoint
CREATE INDEX "refund_events_attempt_received_idx"
  ON "refund_events" ("refund_attempt_id","received_at");
--> statement-breakpoint
CREATE INDEX "refund_events_pending_idx"
  ON "refund_events" ("processing_status","received_at");
--> statement-breakpoint
CREATE TABLE "refund_event_conflicts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "original_event_id" uuid NOT NULL,
  "incoming_attempt_id" uuid NOT NULL,
  "incoming_fingerprint" text NOT NULL,
  "reason" text NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "refund_event_conflicts_fingerprint_ck" CHECK
    ("incoming_fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "refund_event_conflicts_reason_ck" CHECK
    ("reason" IN ('FINGERPRINT_MISMATCH','ATTEMPT_MISMATCH'))
);
--> statement-breakpoint
ALTER TABLE "refund_event_conflicts" ADD CONSTRAINT "refund_event_conflicts_original_fk"
  FOREIGN KEY ("original_event_id") REFERENCES "public"."refund_events"("id");
--> statement-breakpoint
ALTER TABLE "refund_event_conflicts" ADD CONSTRAINT "refund_event_conflicts_attempt_fk"
  FOREIGN KEY ("incoming_attempt_id") REFERENCES "public"."refund_attempts"("id");
--> statement-breakpoint
CREATE INDEX "refund_event_conflicts_original_received_idx"
  ON "refund_event_conflicts" ("original_event_id","received_at");
--> statement-breakpoint
CREATE TABLE "refund_case_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "refund_case_id" uuid NOT NULL,
  "from_status" text,
  "to_status" text NOT NULL,
  "actor_account_id" uuid,
  "actor_role" text NOT NULL,
  "reason" text NOT NULL,
  "refund_event_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "refund_case_events_from_ck" CHECK ("from_status" IS NULL OR "from_status" IN
    ('REQUESTED','APPROVED','REJECTED','PROCESSING','REFUNDED','REVIEW_REQUIRED')),
  CONSTRAINT "refund_case_events_to_ck" CHECK ("to_status" IN
    ('REQUESTED','APPROVED','REJECTED','PROCESSING','REFUNDED','REVIEW_REQUIRED')),
  CONSTRAINT "refund_case_events_actor_ck" CHECK (
    ("actor_role" IN ('customer','admin') AND "actor_account_id" IS NOT NULL)
    OR ("actor_role" = 'system' AND "actor_account_id" IS NULL)),
  CONSTRAINT "refund_case_events_reason_ck" CHECK
    (length(trim("reason")) BETWEEN 1 AND 500)
);
--> statement-breakpoint
ALTER TABLE "refund_case_events" ADD CONSTRAINT "refund_case_events_case_fk"
  FOREIGN KEY ("refund_case_id") REFERENCES "public"."refund_cases"("id");
--> statement-breakpoint
ALTER TABLE "refund_case_events" ADD CONSTRAINT "refund_case_events_actor_fk"
  FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id");
--> statement-breakpoint
ALTER TABLE "refund_case_events" ADD CONSTRAINT "refund_case_events_refund_event_fk"
  FOREIGN KEY ("refund_event_id") REFERENCES "public"."refund_events"("id");
--> statement-breakpoint
CREATE INDEX "refund_case_events_case_created_idx"
  ON "refund_case_events" ("refund_case_id","created_at");
