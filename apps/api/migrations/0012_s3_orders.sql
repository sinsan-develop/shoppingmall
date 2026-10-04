CREATE TABLE "checkout_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "reservation_id" uuid NOT NULL,
  "idempotency_key" uuid NOT NULL,
  "request_fingerprint" text NOT NULL,
  "address_id" uuid NOT NULL,
  "recipient_name" text NOT NULL,
  "phone" text NOT NULL,
  "postal_code" text NOT NULL,
  "line1" text NOT NULL,
  "line2" text DEFAULT '' NOT NULL,
  "goods_won" integer NOT NULL,
  "goods_discount_won" integer NOT NULL,
  "shipping_fee_won" integer NOT NULL,
  "shipping_support_won" integer NOT NULL,
  "payable_won" integer NOT NULL,
  "status" text DEFAULT 'PENDING_PAYMENT' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "ended_at" timestamp with time zone,
  CONSTRAINT "checkout_orders_fingerprint_ck" CHECK ("request_fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "checkout_orders_address_ck" CHECK (length(trim("recipient_name")) > 0 AND length(trim("phone")) > 0 AND length(trim("postal_code")) > 0 AND length(trim("line1")) > 0),
  CONSTRAINT "checkout_orders_money_ck" CHECK ("goods_won" >= 0 AND "goods_discount_won" BETWEEN 0 AND "goods_won" AND "shipping_fee_won" >= 0 AND "shipping_support_won" BETWEEN 0 AND "shipping_fee_won" AND "payable_won" = "goods_won" - "goods_discount_won" + "shipping_fee_won" - "shipping_support_won"),
  CONSTRAINT "checkout_orders_status_ck" CHECK ("status" IN ('PENDING_PAYMENT','EXPIRED')),
  CONSTRAINT "checkout_orders_expires_ck" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "checkout_orders_ended_ck" CHECK (("status" = 'PENDING_PAYMENT' AND "ended_at" IS NULL) OR ("status" = 'EXPIRED' AND "ended_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "shipment_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "checkout_order_id" uuid NOT NULL,
  "shipment_key" text NOT NULL,
  "shipping_mode" product_shipping_mode NOT NULL,
  "seller_id" uuid,
  "goods_won" integer NOT NULL,
  "goods_discount_won" integer NOT NULL,
  "shipping_fee_won" integer NOT NULL,
  "shipping_support_won" integer NOT NULL,
  "payable_won" integer NOT NULL,
  "status" text DEFAULT 'PENDING_PAYMENT' NOT NULL,
  CONSTRAINT "shipment_orders_key_ck" CHECK (length(trim("shipment_key")) > 0),
  CONSTRAINT "shipment_orders_mode_seller_ck" CHECK (("shipping_mode" = 'seller_direct' AND "seller_id" IS NOT NULL) OR ("shipping_mode" = 'owool_fulfillment' AND "seller_id" IS NULL)),
  CONSTRAINT "shipment_orders_money_ck" CHECK ("goods_won" >= 0 AND "goods_discount_won" BETWEEN 0 AND "goods_won" AND "shipping_fee_won" >= 0 AND "shipping_support_won" BETWEEN 0 AND "shipping_fee_won" AND "payable_won" = "goods_won" - "goods_discount_won" + "shipping_fee_won" - "shipping_support_won"),
  CONSTRAINT "shipment_orders_status_ck" CHECK ("status" IN ('PENDING_PAYMENT','EXPIRED'))
);
--> statement-breakpoint
CREATE TABLE "shipment_order_lines" (
  "shipment_order_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "option_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "product_name" text NOT NULL,
  "option_name" text NOT NULL,
  "unit_price_won" integer NOT NULL,
  "quantity" integer NOT NULL,
  "goods_discount_won" integer NOT NULL,
  "goods_payable_won" integer NOT NULL,
  CONSTRAINT "shipment_order_lines_pk" PRIMARY KEY ("shipment_order_id","option_id"),
  CONSTRAINT "shipment_order_lines_names_ck" CHECK (length(trim("product_name")) > 0 AND length(trim("option_name")) > 0),
  CONSTRAINT "shipment_order_lines_money_ck" CHECK ("unit_price_won" >= 0 AND "quantity" BETWEEN 1 AND 1000000 AND "goods_discount_won" >= 0 AND "goods_payable_won" >= 0 AND "goods_payable_won"::bigint = "unit_price_won"::bigint * "quantity" - "goods_discount_won")
);
--> statement-breakpoint
CREATE TABLE "order_promotion_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "checkout_order_id" uuid NOT NULL,
  "shipment_order_id" uuid NOT NULL,
  "promotion_use_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "version_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "amount_won" integer NOT NULL,
  CONSTRAINT "order_promotion_allocations_kind_ck" CHECK ("kind" IN ('goods_discount','shipping_support')),
  CONSTRAINT "order_promotion_allocations_amount_ck" CHECK ("amount_won" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_status_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "checkout_order_id" uuid NOT NULL,
  "status" text NOT NULL,
  "actor_account_id" uuid,
  "reason" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "order_status_events_status_ck" CHECK ("status" IN ('PENDING_PAYMENT','EXPIRED')),
  CONSTRAINT "order_status_events_reason_ck" CHECK (length(trim("reason")) BETWEEN 1 AND 500)
);
--> statement-breakpoint
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_account_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");
--> statement-breakpoint
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_reservation_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."checkout_reservations"("id");
--> statement-breakpoint
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_address_fk" FOREIGN KEY ("address_id") REFERENCES "public"."customer_addresses"("id");
--> statement-breakpoint
ALTER TABLE "shipment_orders" ADD CONSTRAINT "shipment_orders_checkout_fk" FOREIGN KEY ("checkout_order_id") REFERENCES "public"."checkout_orders"("id");
--> statement-breakpoint
ALTER TABLE "shipment_orders" ADD CONSTRAINT "shipment_orders_seller_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id");
--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_orders_checkout_id_uq" ON "shipment_orders" ("checkout_order_id","id");
--> statement-breakpoint
ALTER TABLE "shipment_order_lines" ADD CONSTRAINT "shipment_order_lines_shipment_fk" FOREIGN KEY ("shipment_order_id") REFERENCES "public"."shipment_orders"("id");
--> statement-breakpoint
ALTER TABLE "shipment_order_lines" ADD CONSTRAINT "shipment_order_lines_product_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");
--> statement-breakpoint
ALTER TABLE "shipment_order_lines" ADD CONSTRAINT "shipment_order_lines_option_fk" FOREIGN KEY ("option_id") REFERENCES "public"."product_options"("id");
--> statement-breakpoint
ALTER TABLE "shipment_order_lines" ADD CONSTRAINT "shipment_order_lines_seller_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id");
--> statement-breakpoint
ALTER TABLE "order_promotion_allocations" ADD CONSTRAINT "order_promotion_allocations_checkout_fk" FOREIGN KEY ("checkout_order_id") REFERENCES "public"."checkout_orders"("id");
--> statement-breakpoint
ALTER TABLE "order_promotion_allocations" ADD CONSTRAINT "order_promotion_allocations_shipment_order_fk" FOREIGN KEY ("checkout_order_id","shipment_order_id") REFERENCES "public"."shipment_orders"("checkout_order_id","id");
--> statement-breakpoint
ALTER TABLE "order_promotion_allocations" ADD CONSTRAINT "order_promotion_allocations_use_fk" FOREIGN KEY ("promotion_use_id") REFERENCES "public"."promotion_uses"("id");
--> statement-breakpoint
ALTER TABLE "order_promotion_allocations" ADD CONSTRAINT "order_promotion_allocations_campaign_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."promotion_campaigns"("id");
--> statement-breakpoint
ALTER TABLE "order_promotion_allocations" ADD CONSTRAINT "order_promotion_allocations_version_fk" FOREIGN KEY ("version_id") REFERENCES "public"."promotion_versions"("id");
--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_checkout_fk" FOREIGN KEY ("checkout_order_id") REFERENCES "public"."checkout_orders"("id");
--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_actor_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id");
--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_orders_account_key_uq" ON "checkout_orders" ("account_id","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_orders_reservation_uq" ON "checkout_orders" ("reservation_id");
--> statement-breakpoint
CREATE INDEX "checkout_orders_due_idx" ON "checkout_orders" ("status","expires_at");
--> statement-breakpoint
CREATE INDEX "checkout_orders_account_created_idx" ON "checkout_orders" ("account_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_orders_checkout_key_uq" ON "shipment_orders" ("checkout_order_id","shipment_key");
--> statement-breakpoint
CREATE INDEX "shipment_order_lines_product_idx" ON "shipment_order_lines" ("product_id");
--> statement-breakpoint
CREATE INDEX "shipment_order_lines_seller_idx" ON "shipment_order_lines" ("seller_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "order_promotion_allocations_use_shipment_kind_uq" ON "order_promotion_allocations" ("promotion_use_id","shipment_order_id","kind");
--> statement-breakpoint
CREATE INDEX "order_promotion_allocations_checkout_idx" ON "order_promotion_allocations" ("checkout_order_id");
--> statement-breakpoint
CREATE INDEX "order_status_events_checkout_created_idx" ON "order_status_events" ("checkout_order_id","created_at");
