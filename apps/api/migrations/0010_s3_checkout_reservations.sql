CREATE TABLE "checkout_reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "idempotency_key" uuid NOT NULL,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "ended_at" timestamp with time zone,
  "end_reason" text,
  CONSTRAINT "checkout_reservations_status_ck" CHECK ("status" IN ('ACTIVE','EXPIRED','RELEASED','CANCELLED','CONSUMED')),
  CONSTRAINT "checkout_reservations_expires_ck" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "checkout_reservations_ended_ck" CHECK (("status" = 'ACTIVE' AND "ended_at" IS NULL) OR ("status" <> 'ACTIVE' AND "ended_at" IS NOT NULL)),
  CONSTRAINT "checkout_reservations_reason_ck" CHECK ("status" <> 'CANCELLED' OR length(trim(coalesce("end_reason",''))) BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE TABLE "checkout_reservation_lines" (
  "reservation_id" uuid NOT NULL,
  "option_id" uuid NOT NULL,
  "quantity" integer NOT NULL,
  CONSTRAINT "checkout_reservation_lines_pk" PRIMARY KEY("reservation_id","option_id"),
  CONSTRAINT "checkout_reservation_lines_quantity_ck" CHECK ("quantity" BETWEEN 1 AND 1000000)
);
--> statement-breakpoint
CREATE TABLE "inventory_deferred_stock_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "option_id" uuid NOT NULL,
  "target_on_hand" integer DEFAULT 0 NOT NULL,
  "requested_by_account_id" uuid NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "applied_at" timestamp with time zone,
  CONSTRAINT "inventory_deferred_stock_targets_zero_ck" CHECK ("target_on_hand" = 0),
  CONSTRAINT "inventory_deferred_stock_targets_status_ck" CHECK ("status" IN ('pending','applied','superseded')),
  CONSTRAINT "inventory_deferred_stock_targets_applied_ck" CHECK ("status" <> 'applied' OR "applied_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "checkout_reservations" ADD CONSTRAINT "checkout_reservations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "checkout_reservation_lines" ADD CONSTRAINT "checkout_reservation_lines_reservation_id_checkout_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."checkout_reservations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "checkout_reservation_lines" ADD CONSTRAINT "checkout_reservation_lines_option_id_product_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."product_options"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_deferred_stock_targets" ADD CONSTRAINT "inventory_deferred_stock_targets_option_id_product_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."product_options"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_deferred_stock_targets" ADD CONSTRAINT "inventory_deferred_stock_targets_requested_by_account_id_accounts_id_fk" FOREIGN KEY ("requested_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_reservations_account_key_uq" ON "checkout_reservations" USING btree ("account_id","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_reservations_account_active_uq" ON "checkout_reservations" USING btree ("account_id") WHERE "status" = 'ACTIVE';
--> statement-breakpoint
CREATE INDEX "checkout_reservations_due_idx" ON "checkout_reservations" USING btree ("status","expires_at");
--> statement-breakpoint
CREATE INDEX "checkout_reservation_lines_option_idx" ON "checkout_reservation_lines" USING btree ("option_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_deferred_stock_targets_pending_uq" ON "inventory_deferred_stock_targets" USING btree ("option_id") WHERE "status" = 'pending';
--> statement-breakpoint
CREATE INDEX "inventory_deferred_stock_targets_option_idx" ON "inventory_deferred_stock_targets" USING btree ("option_id");
