CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
CREATE TABLE "settlement_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dedupe_key" text NOT NULL,
  "kind" text NOT NULL,
  "amount_won" bigint NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "seller_id" uuid NOT NULL REFERENCES "sellers"("id"),
  "seller_name" text NOT NULL,
  "seller_category_id" uuid NOT NULL REFERENCES "seller_categories"("id"),
  "seller_category_name" text NOT NULL,
  "checkout_order_id" uuid REFERENCES "checkout_orders"("id"),
  "shipment_order_id" uuid REFERENCES "shipment_orders"("id"),
  "product_id" uuid REFERENCES "products"("id"),
  "option_id" uuid REFERENCES "product_options"("id"),
  "product_name" text,
  "option_name" text,
  "source_event_kind" text NOT NULL,
  "source_event_id" uuid NOT NULL,
  "recorded_by" uuid REFERENCES "accounts"("id"),
  "reason" text,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "settlement_events_dedupe_ck" CHECK
    (length("dedupe_key") BETWEEN 1 AND 250),
  CONSTRAINT "settlement_events_kind_ck" CHECK ("kind" IN
    ('sale','goods_discount','shipping_fee','shipping_support',
     'goods_refund','shipping_refund','commission','correction')),
  CONSTRAINT "settlement_events_money_ck" CHECK ("amount_won" > 0),
  CONSTRAINT "settlement_events_seller_ck" CHECK
    (length(trim("seller_name")) > 0 AND length(trim("seller_category_name")) > 0),
  CONSTRAINT "settlement_events_source_ck" CHECK (
    ("source_event_kind" = 'payment' AND "kind" IN
      ('sale','goods_discount','shipping_fee','shipping_support')
      AND "checkout_order_id" IS NOT NULL AND "shipment_order_id" IS NOT NULL
      AND "recorded_by" IS NULL)
    OR ("source_event_kind" = 'refund' AND "kind" IN
      ('goods_refund','shipping_refund')
      AND "checkout_order_id" IS NOT NULL AND "shipment_order_id" IS NOT NULL
      AND "recorded_by" IS NULL)
    OR ("source_event_kind" = 'manual_commission' AND "kind" = 'commission'
      AND "recorded_by" IS NOT NULL AND length(trim("reason")) BETWEEN 1 AND 500)
    OR ("source_event_kind" = 'correction' AND "kind" = 'correction'
      AND "recorded_by" IS NOT NULL AND length(trim("reason")) BETWEEN 1 AND 500)),
  CONSTRAINT "settlement_events_product_ck" CHECK
    (("product_id" IS NULL AND "option_id" IS NULL
      AND "product_name" IS NULL AND "option_name" IS NULL)
      OR ("product_id" IS NOT NULL AND "option_id" IS NOT NULL
      AND "product_name" IS NOT NULL AND "option_name" IS NOT NULL
      AND length(trim("product_name")) > 0 AND length(trim("option_name")) > 0)),
  CONSTRAINT "settlement_events_kind_product_ck" CHECK
    (("kind" IN ('sale','goods_discount','goods_refund')) = ("option_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_events_dedupe_uq" ON "settlement_events" ("dedupe_key");
--> statement-breakpoint
CREATE INDEX "settlement_events_seller_occurred_idx"
  ON "settlement_events" ("seller_id","occurred_at","id");
--> statement-breakpoint
CREATE INDEX "settlement_events_category_occurred_idx"
  ON "settlement_events" ("seller_category_id","occurred_at");
--> statement-breakpoint
CREATE INDEX "settlement_events_order_idx" ON "settlement_events" ("checkout_order_id");
--> statement-breakpoint
CREATE TABLE "seller_settlement_periods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "seller_id" uuid NOT NULL REFERENCES "sellers"("id"),
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "completed_by" uuid NOT NULL REFERENCES "accounts"("id"),
  "reason" text NOT NULL,
  "completed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "seller_settlement_periods_dates_ck" CHECK ("start_date" <= "end_date"),
  CONSTRAINT "seller_settlement_periods_reason_ck"
    CHECK (length(trim("reason")) BETWEEN 1 AND 500),
  CONSTRAINT "seller_settlement_periods_no_overlap" EXCLUDE USING gist
    ("seller_id" WITH =, daterange("start_date","end_date",'[]') WITH &&)
);
--> statement-breakpoint
CREATE INDEX "seller_settlement_periods_seller_idx"
  ON "seller_settlement_periods" ("seller_id","start_date","end_date");
--> statement-breakpoint
CREATE FUNCTION prevent_settlement_history_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Settlement history is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER settlement_events_immutable BEFORE UPDATE OR DELETE ON "settlement_events"
FOR EACH ROW EXECUTE FUNCTION prevent_settlement_history_change();
--> statement-breakpoint
CREATE TRIGGER seller_settlement_periods_immutable
BEFORE UPDATE OR DELETE ON "seller_settlement_periods"
FOR EACH ROW EXECUTE FUNCTION prevent_settlement_history_change();
