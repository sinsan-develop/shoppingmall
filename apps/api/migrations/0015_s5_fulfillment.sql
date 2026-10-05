CREATE TABLE "fulfillment_settings" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "owool_seller_id" uuid REFERENCES "sellers"("id"),
  "updated_by" uuid REFERENCES "accounts"("id"),
  "version" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fulfillment_settings_singleton_ck" CHECK ("id" = 1),
  CONSTRAINT "fulfillment_settings_version_ck" CHECK ("version" >= 0)
);
--> statement-breakpoint
INSERT INTO "fulfillment_settings" ("id") VALUES (1);
--> statement-breakpoint
CREATE TABLE "shipment_fulfillments" (
  "shipment_order_id" uuid PRIMARY KEY REFERENCES "shipment_orders"("id") NOT NULL,
  "fulfillment_seller_id" uuid REFERENCES "sellers"("id") NOT NULL,
  "status" text DEFAULT 'PAYMENT_PENDING' NOT NULL,
  "cutoff_time" text,
  "timezone" text DEFAULT 'Asia/Seoul' NOT NULL,
  "expected_ship_date" date,
  "carrier_code" text,
  "carrier_name" text,
  "tracking_number" text,
  "packed_at" timestamp with time zone,
  "first_shipped_at" timestamp with time zone,
  "shipped_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "version" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "shipment_fulfillments_status_ck" CHECK ("status" IN
    ('PAYMENT_PENDING','READY','PACKING','DELAYED','SHIPPED','CANCELLED')),
  CONSTRAINT "shipment_fulfillments_cutoff_ck" CHECK
    ("cutoff_time" IS NULL OR "cutoff_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "shipment_fulfillments_timezone_ck" CHECK ("timezone" = 'Asia/Seoul'),
  CONSTRAINT "shipment_fulfillments_version_ck" CHECK ("version" >= 0),
  CONSTRAINT "shipment_fulfillments_pending_ck" CHECK (
    ("status" = 'PAYMENT_PENDING' AND "expected_ship_date" IS NULL
      AND "packed_at" IS NULL AND "first_shipped_at" IS NULL)
    OR ("status" <> 'PAYMENT_PENDING' AND "expected_ship_date" IS NOT NULL)),
  CONSTRAINT "shipment_fulfillments_packing_ck" CHECK
    ("status" <> 'PACKING' OR "packed_at" IS NOT NULL),
  CONSTRAINT "shipment_fulfillments_shipping_ck" CHECK (
    ("status" = 'SHIPPED' AND "carrier_code" IS NOT NULL
      AND "carrier_code" IN ('cj_logistics','korea_post','hanjin','lotte','other')
      AND "tracking_number" IS NOT NULL AND "tracking_number" ~ '^[A-Za-z0-9]{1,50}$'
      AND "first_shipped_at" IS NOT NULL AND "shipped_at" IS NOT NULL
      AND (("carrier_code" = 'other' AND "carrier_name" IS NOT NULL
        AND length(trim("carrier_name")) BETWEEN 1 AND 50)
        OR ("carrier_code" <> 'other' AND "carrier_name" IS NULL)))
    OR ("status" <> 'SHIPPED' AND "carrier_code" IS NULL AND "carrier_name" IS NULL
      AND "tracking_number" IS NULL AND "shipped_at" IS NULL)),
  CONSTRAINT "shipment_fulfillments_cancelled_ck" CHECK
    (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX "shipment_fulfillments_seller_status_idx"
  ON "shipment_fulfillments" ("fulfillment_seller_id","status","shipment_order_id");
--> statement-breakpoint
CREATE INDEX "shipment_fulfillments_status_idx" ON "shipment_fulfillments" ("status","shipment_order_id");
--> statement-breakpoint
CREATE TABLE "shipment_fulfillment_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "shipment_order_id" uuid REFERENCES "shipment_fulfillments"("shipment_order_id") NOT NULL,
  "action" text NOT NULL,
  "from_status" text NOT NULL,
  "to_status" text NOT NULL,
  "actor_account_id" uuid REFERENCES "accounts"("id"),
  "actor_role" text,
  "actor_seller_id" uuid REFERENCES "sellers"("id"),
  "reason" text,
  "customer_message" text,
  "before_snapshot" jsonb NOT NULL,
  "after_snapshot" jsonb NOT NULL,
  "idempotency_scope" text NOT NULL,
  "idempotency_key" uuid NOT NULL,
  "request_fingerprint" text NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "shipment_fulfillment_events_action_ck" CHECK ("action" IN
    ('PAYMENT_CONFIRMED','START_PACKING','REPORT_DELAY','RESUME_PACKING','MARK_SHIPPED','ADMIN_CORRECT','REFUND_CANCELLED')),
  CONSTRAINT "shipment_fulfillment_events_from_ck" CHECK ("from_status" IN
    ('PAYMENT_PENDING','READY','PACKING','DELAYED','SHIPPED','CANCELLED')),
  CONSTRAINT "shipment_fulfillment_events_to_ck" CHECK ("to_status" IN
    ('PAYMENT_PENDING','READY','PACKING','DELAYED','SHIPPED','CANCELLED')),
  CONSTRAINT "shipment_fulfillment_events_actor_ck" CHECK (coalesce(
    ("action" IN ('START_PACKING','REPORT_DELAY','RESUME_PACKING','MARK_SHIPPED')
      AND "actor_role" = 'seller' AND "actor_account_id" IS NOT NULL AND "actor_seller_id" IS NOT NULL
      AND "idempotency_scope" = "actor_account_id"::text)
    OR ("action" = 'ADMIN_CORRECT' AND "actor_role" = 'admin'
      AND "actor_account_id" IS NOT NULL AND "actor_seller_id" IS NULL
      AND "idempotency_scope" = "actor_account_id"::text)
    OR ("action" IN ('PAYMENT_CONFIRMED','REFUND_CANCELLED') AND "actor_role" IS NULL
      AND "actor_account_id" IS NULL AND "actor_seller_id" IS NULL
      AND "idempotency_scope" = CASE "action" WHEN 'PAYMENT_CONFIRMED' THEN 'system:payment' ELSE 'system:refund' END), false)),
  CONSTRAINT "shipment_fulfillment_events_reason_ck" CHECK
    ("reason" IS NULL OR length(trim("reason")) BETWEEN 1 AND 500),
  CONSTRAINT "shipment_fulfillment_events_message_ck" CHECK
    ("customer_message" IS NULL OR length(trim("customer_message")) BETWEEN 1 AND 500),
  CONSTRAINT "shipment_fulfillment_events_notice_ck" CHECK
    ("action" NOT IN ('REPORT_DELAY','ADMIN_CORRECT') OR ("reason" IS NOT NULL AND "customer_message" IS NOT NULL)),
  CONSTRAINT "shipment_fulfillment_events_snapshot_ck" CHECK
    (jsonb_typeof("before_snapshot") = 'object' AND jsonb_typeof("after_snapshot") = 'object'
      AND ("before_snapshot" - ARRAY['status','expectedShipDate','carrierCode','trackingNumber']::text[]) = '{}'::jsonb
      AND ("after_snapshot" - ARRAY['status','expectedShipDate','carrierCode','trackingNumber']::text[]) = '{}'::jsonb),
  CONSTRAINT "shipment_fulfillment_events_fingerprint_ck" CHECK ("request_fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_fulfillment_events_key_uq"
  ON "shipment_fulfillment_events" ("shipment_order_id","idempotency_scope","idempotency_key");
--> statement-breakpoint
CREATE INDEX "shipment_fulfillment_events_shipment_time_idx"
  ON "shipment_fulfillment_events" ("shipment_order_id","occurred_at");
