CREATE TABLE "support_policy_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL,
  "version" integer NOT NULL,
  "effective_at" timestamp with time zone DEFAULT now() NOT NULL,
  "goods_cap_percent" integer DEFAULT 100 NOT NULL,
  "shipping_refund_won" integer DEFAULT 0 NOT NULL,
  "restock_mode" text DEFAULT 'none' NOT NULL,
  "created_by" uuid REFERENCES "accounts"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "support_policy_trial_ck" CHECK ("code" = 'POST_SHIPMENT_TRIAL'
    AND "version" > 0 AND "goods_cap_percent" = 100
    AND "shipping_refund_won" = 0 AND "restock_mode" = 'none'),
  CONSTRAINT "support_policy_code_version_uq" UNIQUE ("code","version")
);
--> statement-breakpoint
INSERT INTO "support_policy_versions" ("code","version") VALUES ('POST_SHIPMENT_TRIAL',1);
--> statement-breakpoint
CREATE TABLE "support_purchase_confirmations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "checkout_order_id" uuid NOT NULL,
  "shipment_order_id" uuid NOT NULL,
  "option_id" uuid NOT NULL,
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "customer_account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "shipped_event_id" uuid NOT NULL REFERENCES "shipment_fulfillment_events"("id"),
  "idempotency_key" uuid NOT NULL,
  "confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "support_confirmations_order_fk" FOREIGN KEY ("checkout_order_id","shipment_order_id")
    REFERENCES "shipment_orders"("checkout_order_id","id"),
  CONSTRAINT "support_confirmations_line_fk" FOREIGN KEY ("shipment_order_id","option_id")
    REFERENCES "shipment_order_lines"("shipment_order_id","option_id"),
  CONSTRAINT "support_confirmations_line_uq" UNIQUE ("shipment_order_id","option_id"),
  CONSTRAINT "support_confirmations_request_uq" UNIQUE ("customer_account_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "support_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "confirmation_id" uuid NOT NULL UNIQUE REFERENCES "support_purchase_confirmations"("id"),
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "customer_account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "rating" integer NOT NULL,
  "body" text NOT NULL,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "approved_by" uuid REFERENCES "accounts"("id"),
  "approved_at" timestamp with time zone,
  "hidden_by" uuid REFERENCES "accounts"("id"),
  "hidden_at" timestamp with time zone,
  "hidden_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "support_reviews_rating_ck" CHECK ("rating" BETWEEN 1 AND 5),
  CONSTRAINT "support_reviews_body_ck" CHECK (length(trim("body")) BETWEEN 1 AND 2000),
  CONSTRAINT "support_reviews_status_ck" CHECK ("status" IN ('PENDING','APPROVED','HIDDEN')),
  CONSTRAINT "support_reviews_version_ck" CHECK ("version" > 0),
  CONSTRAINT "support_reviews_visibility_ck" CHECK (
    ("status" = 'PENDING' AND "approved_at" IS NULL AND "hidden_at" IS NULL)
    OR ("status" = 'APPROVED' AND "approved_by" IS NOT NULL AND "approved_at" IS NOT NULL
      AND "hidden_at" IS NULL)
    OR ("status" = 'HIDDEN' AND "hidden_by" IS NOT NULL AND "hidden_at" IS NOT NULL
      AND "hidden_reason" IS NOT NULL AND length(trim("hidden_reason")) BETWEEN 1 AND 500))
);
--> statement-breakpoint
CREATE INDEX "support_reviews_public_idx" ON "support_reviews" ("product_id","status","created_at");
--> statement-breakpoint
CREATE TABLE "support_review_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "review_id" uuid NOT NULL REFERENCES "support_reviews"("id"),
  "action" text NOT NULL,
  "actor_account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "actor_role" text NOT NULL,
  "reason" text,
  "before_value" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "after_value" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "support_review_events_action_ck" CHECK ("action" IN
    ('CREATED','EDITED','APPROVED','HIDDEN','REPORTED')),
  CONSTRAINT "support_review_events_role_ck" CHECK ("actor_role" IN ('customer','admin')),
  CONSTRAINT "support_review_events_snapshot_ck" CHECK
    (jsonb_typeof("before_value") = 'object' AND jsonb_typeof("after_value") = 'object'
      AND NOT ("before_value" ? 'objectKey') AND NOT ("after_value" ? 'objectKey'))
);
--> statement-breakpoint
CREATE INDEX "support_review_events_review_idx" ON "support_review_events" ("review_id","occurred_at");
--> statement-breakpoint
CREATE TABLE "support_review_images" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "review_id" uuid NOT NULL REFERENCES "support_reviews"("id"),
  "object_key" text NOT NULL UNIQUE,
  "mime_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "scan_status" text DEFAULT 'PENDING' NOT NULL,
  "scanned_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "support_review_images_type_ck" CHECK ("mime_type" = 'image/webp'
    AND "size_bytes" BETWEEN 1 AND 5242880),
  CONSTRAINT "support_review_images_scan_ck" CHECK
    (("scan_status" = 'PENDING' AND "scanned_at" IS NULL)
      OR ("scan_status" IN ('PASS','FAILED') AND "scanned_at" IS NOT NULL)),
  CONSTRAINT "support_review_images_key_ck" CHECK
    ("object_key" ~ '^quarantine/[0-9a-f-]{36}\.webp$')
);
--> statement-breakpoint
CREATE INDEX "support_review_images_review_idx" ON "support_review_images" ("review_id");
--> statement-breakpoint
CREATE TABLE "support_review_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "review_id" uuid NOT NULL REFERENCES "support_reviews"("id"),
  "reporter_account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "reason" text NOT NULL,
  "reported_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "support_review_reports_reason_ck" CHECK (length(trim("reason")) BETWEEN 1 AND 500),
  CONSTRAINT "support_review_reports_once_uq" UNIQUE ("review_id","reporter_account_id")
);
--> statement-breakpoint
CREATE TABLE "support_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "customer_account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "seller_id" uuid NOT NULL REFERENCES "sellers"("id"),
  "body" text NOT NULL,
  "status" text DEFAULT 'OPEN' NOT NULL,
  "idempotency_key" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "support_questions_body_ck" CHECK (length(trim("body")) BETWEEN 1 AND 2000),
  CONSTRAINT "support_questions_status_ck" CHECK ("status" IN ('OPEN','ANSWERED','PUBLISHED','HIDDEN')),
  CONSTRAINT "support_questions_request_uq" UNIQUE ("customer_account_id","idempotency_key")
);
--> statement-breakpoint
CREATE INDEX "support_questions_seller_idx" ON "support_questions" ("seller_id","status","created_at");
--> statement-breakpoint
CREATE TABLE "support_question_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "question_id" uuid NOT NULL REFERENCES "support_questions"("id"),
  "author_account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "author_role" text NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "support_question_messages_role_ck" CHECK ("author_role" IN ('customer','seller','admin')),
  CONSTRAINT "support_question_messages_body_ck" CHECK (length(trim("body")) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE INDEX "support_question_messages_question_idx" ON "support_question_messages" ("question_id","created_at","id");
--> statement-breakpoint
CREATE TABLE "support_question_message_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL REFERENCES "support_question_messages"("id"),
  "action" text NOT NULL,
  "actor_account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "actor_role" text NOT NULL,
  "reason" text,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "support_question_message_events_action_ck" CHECK ("action" IN ('SUBMITTED','PUBLISHED','HIDDEN')),
  CONSTRAINT "support_question_message_events_role_ck" CHECK
    (("action" = 'SUBMITTED' AND "actor_role" IN ('customer','seller','admin'))
      OR ("action" IN ('PUBLISHED','HIDDEN') AND "actor_role" = 'admin')),
  CONSTRAINT "support_question_message_events_reason_ck" CHECK
    ("reason" IS NULL OR length(trim("reason")) BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE INDEX "support_question_message_events_message_idx" ON "support_question_message_events" ("message_id","occurred_at","id");
--> statement-breakpoint
CREATE TABLE "support_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "checkout_order_id" uuid NOT NULL,
  "shipment_order_id" uuid NOT NULL,
  "option_id" uuid NOT NULL,
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "customer_account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "seller_id" uuid NOT NULL REFERENCES "sellers"("id"),
  "kind" text NOT NULL,
  "reason_code" text NOT NULL,
  "reason" text NOT NULL,
  "quantity" integer NOT NULL,
  "status" text DEFAULT 'REQUESTED' NOT NULL,
  "idempotency_key" uuid NOT NULL,
  "policy_version_id" uuid REFERENCES "support_policy_versions"("id"),
  "decision_by" uuid REFERENCES "accounts"("id"),
  "decision_reason" text,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "support_claims_order_fk" FOREIGN KEY ("checkout_order_id","shipment_order_id")
    REFERENCES "shipment_orders"("checkout_order_id","id"),
  CONSTRAINT "support_claims_line_fk" FOREIGN KEY ("shipment_order_id","option_id")
    REFERENCES "shipment_order_lines"("shipment_order_id","option_id"),
  CONSTRAINT "support_claims_kind_ck" CHECK ("kind" IN ('CLAIM','RETURN','EXCHANGE')),
  CONSTRAINT "support_claims_reason_code_ck" CHECK ("reason_code" IN
    ('quality_issue','damaged','wrong_delivery','change_of_mind','other')),
  CONSTRAINT "support_claims_reason_ck" CHECK (length(trim("reason")) BETWEEN 1 AND 2000),
  CONSTRAINT "support_claims_quantity_ck" CHECK ("quantity" > 0),
  CONSTRAINT "support_claims_status_ck" CHECK ("status" IN
    ('REQUESTED','SELLER_REPLIED','APPROVED','REJECTED','REFUND_PROCESSING','REFUNDED','REVIEW_REQUIRED')),
  CONSTRAINT "support_claims_decision_ck" CHECK
    (("status" IN ('REQUESTED','SELLER_REPLIED') AND "decision_by" IS NULL
      AND "decision_reason" IS NULL AND "decided_at" IS NULL AND "policy_version_id" IS NULL)
      OR ("status" NOT IN ('REQUESTED','SELLER_REPLIED') AND "decision_by" IS NOT NULL
        AND "decision_reason" IS NOT NULL AND "decided_at" IS NOT NULL
        AND "policy_version_id" IS NOT NULL)),
  CONSTRAINT "support_claims_request_uq" UNIQUE ("customer_account_id","idempotency_key"),
  CONSTRAINT "support_claims_bridge_uq" UNIQUE ("id","checkout_order_id","shipment_order_id","customer_account_id")
);
--> statement-breakpoint
CREATE INDEX "support_claims_seller_idx" ON "support_claims" ("seller_id","status","created_at");
--> statement-breakpoint
CREATE TABLE "support_claim_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "claim_id" uuid NOT NULL REFERENCES "support_claims"("id"),
  "action" text NOT NULL,
  "actor_account_id" uuid REFERENCES "accounts"("id"),
  "actor_role" text NOT NULL,
  "reason" text NOT NULL,
  "before_status" text,
  "after_status" text NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "support_claim_events_action_ck" CHECK ("action" IN
    ('REQUESTED','SELLER_REPLIED','APPROVED','REJECTED','REFUND_PROCESSING','REFUNDED','REVIEW_REQUIRED')),
  CONSTRAINT "support_claim_events_role_ck" CHECK ("actor_role" IN ('customer','seller','admin','system')),
  CONSTRAINT "support_claim_events_reason_ck" CHECK (length(trim("reason")) BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE INDEX "support_claim_events_claim_idx" ON "support_claim_events" ("claim_id","occurred_at");
--> statement-breakpoint
CREATE TABLE "support_claim_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "claim_id" uuid NOT NULL REFERENCES "support_claims"("id"),
  "author_account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "author_role" text NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "support_claim_messages_role_ck" CHECK ("author_role" IN ('customer','seller','admin')),
  CONSTRAINT "support_claim_messages_body_ck" CHECK (length(trim("body")) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE INDEX "support_claim_messages_claim_idx" ON "support_claim_messages" ("claim_id","created_at","id");
--> statement-breakpoint
CREATE TABLE "support_claim_evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "claim_id" uuid NOT NULL REFERENCES "support_claims"("id"),
  "uploaded_by" uuid NOT NULL REFERENCES "accounts"("id"),
  "object_key" text NOT NULL UNIQUE,
  "mime_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "support_claim_evidence_type_ck" CHECK ("mime_type" = 'image/webp'
    AND "size_bytes" BETWEEN 1 AND 5242880),
  CONSTRAINT "support_claim_evidence_key_ck" CHECK
    ("object_key" ~ '^quarantine/[0-9a-f-]{36}\.webp$')
);
--> statement-breakpoint
CREATE INDEX "support_claim_evidence_claim_idx" ON "support_claim_evidence" ("claim_id");
--> statement-breakpoint
ALTER TABLE "refund_cases" ADD COLUMN "post_shipment_claim_id" uuid;
--> statement-breakpoint
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_post_claim_fk"
  FOREIGN KEY ("post_shipment_claim_id","checkout_order_id","shipment_order_id","requester_account_id")
  REFERENCES "support_claims"("id","checkout_order_id","shipment_order_id","customer_account_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "refund_cases_post_claim_uq" ON "refund_cases" ("post_shipment_claim_id")
  WHERE "post_shipment_claim_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "refund_cases" DROP CONSTRAINT "refund_cases_state_ck";
--> statement-breakpoint
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_state_ck" CHECK (
  "post_shipment_claim_id" IS NOT NULL OR
  ("status" = 'REQUESTED' AND "decided_at" IS NULL AND "completed_at" IS NULL
    AND "decision_by" IS NULL AND "decision_reason" IS NULL
    AND "decision_idempotency_key" IS NULL AND "decision_fingerprint" IS NULL
    AND "pre_shipment_evidence" IS NULL AND "pre_shipment_confirmed_by" IS NULL
    AND "pre_shipment_confirmed_at" IS NULL
    AND "goods_refund_won" = 0 AND "shipping_refund_won" = 0 AND "total_refund_won" = 0)
  OR ("status" IN ('APPROVED','PROCESSING') AND "post_shipment_claim_id" IS NULL
    AND "decided_at" IS NOT NULL AND "completed_at" IS NULL
    AND "decision_by" IS NOT NULL AND "decision_reason" IS NOT NULL
    AND "decision_idempotency_key" IS NOT NULL AND "decision_fingerprint" IS NOT NULL
    AND "pre_shipment_evidence" = 'ADMIN_CONFIRMED_NOT_DISPATCHED'
    AND "pre_shipment_confirmed_by" IS NOT NULL AND "pre_shipment_confirmed_at" IS NOT NULL)
  OR ("status" = 'REJECTED' AND "post_shipment_claim_id" IS NULL
    AND "decided_at" IS NOT NULL AND "completed_at" IS NOT NULL
    AND "decision_by" IS NOT NULL AND "decision_reason" IS NOT NULL
    AND "decision_idempotency_key" IS NOT NULL AND "decision_fingerprint" IS NOT NULL
    AND "goods_refund_won" = 0 AND "shipping_refund_won" = 0 AND "total_refund_won" = 0)
  OR ("status" = 'REFUNDED' AND "post_shipment_claim_id" IS NULL
    AND "decided_at" IS NOT NULL AND "completed_at" IS NOT NULL
    AND "decision_by" IS NOT NULL AND "decision_reason" IS NOT NULL
    AND "decision_idempotency_key" IS NOT NULL AND "decision_fingerprint" IS NOT NULL
    AND "pre_shipment_evidence" = 'ADMIN_CONFIRMED_NOT_DISPATCHED'
    AND "pre_shipment_confirmed_by" IS NOT NULL AND "pre_shipment_confirmed_at" IS NOT NULL)
  OR ("status" = 'REVIEW_REQUIRED' AND "post_shipment_claim_id" IS NULL
    AND "decided_at" IS NOT NULL AND "completed_at" IS NULL
    AND "decision_by" IS NOT NULL AND "decision_reason" IS NOT NULL
    AND "decision_idempotency_key" IS NOT NULL AND "decision_fingerprint" IS NOT NULL
    AND "pre_shipment_evidence" = 'ADMIN_CONFIRMED_NOT_DISPATCHED'
    AND "pre_shipment_confirmed_by" IS NOT NULL AND "pre_shipment_confirmed_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_post_state_ck" CHECK (
  "post_shipment_claim_id" IS NULL OR (
    "requester_role" = 'customer' AND "policy_code" = 'POST_SHIPMENT_TRIAL' AND "policy_version" > 0
    AND "pre_shipment_evidence" IS NULL AND "pre_shipment_confirmed_by" IS NULL
    AND "pre_shipment_confirmed_at" IS NULL AND "shipping_refund_won" = 0
    AND (("status" = 'REQUESTED' AND "decided_at" IS NULL AND "completed_at" IS NULL
      AND "decision_by" IS NULL AND "decision_reason" IS NULL
      AND "decision_idempotency_key" IS NULL AND "decision_fingerprint" IS NULL
      AND "goods_refund_won" = 0 AND "total_refund_won" = 0)
    OR ("status" IN ('APPROVED','PROCESSING','REVIEW_REQUIRED','REFUNDED')
      AND "decided_at" IS NOT NULL AND "decision_by" IS NOT NULL
      AND "decision_reason" IS NOT NULL AND "decision_idempotency_key" IS NOT NULL
      AND "decision_fingerprint" IS NOT NULL
      AND (("status" = 'REFUNDED' AND "completed_at" IS NOT NULL)
        OR ("status" <> 'REFUNDED' AND "completed_at" IS NULL)))
    OR ("status" = 'REJECTED' AND "decided_at" IS NOT NULL
      AND "completed_at" IS NOT NULL AND "decision_by" IS NOT NULL
      AND "decision_reason" IS NOT NULL AND "decision_idempotency_key" IS NOT NULL
      AND "decision_fingerprint" IS NOT NULL AND "goods_refund_won" = 0
      AND "total_refund_won" = 0))
  )
);
--> statement-breakpoint
CREATE FUNCTION "support_reject_history_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'support history is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "support_question_messages_immutable" BEFORE UPDATE OR DELETE ON "support_question_messages"
  FOR EACH ROW EXECUTE FUNCTION "support_reject_history_mutation"();
--> statement-breakpoint
CREATE TRIGGER "support_question_message_events_immutable" BEFORE UPDATE OR DELETE ON "support_question_message_events"
  FOR EACH ROW EXECUTE FUNCTION "support_reject_history_mutation"();
--> statement-breakpoint
CREATE TRIGGER "support_claim_messages_immutable" BEFORE UPDATE OR DELETE ON "support_claim_messages"
  FOR EACH ROW EXECUTE FUNCTION "support_reject_history_mutation"();
--> statement-breakpoint
CREATE TRIGGER "support_claim_events_immutable" BEFORE UPDATE OR DELETE ON "support_claim_events"
  FOR EACH ROW EXECUTE FUNCTION "support_reject_history_mutation"();
--> statement-breakpoint
CREATE TRIGGER "support_review_events_immutable" BEFORE UPDATE OR DELETE ON "support_review_events"
  FOR EACH ROW EXECUTE FUNCTION "support_reject_history_mutation"();
--> statement-breakpoint
CREATE TRIGGER "support_confirmations_immutable" BEFORE UPDATE OR DELETE ON "support_purchase_confirmations"
  FOR EACH ROW EXECUTE FUNCTION "support_reject_history_mutation"();
