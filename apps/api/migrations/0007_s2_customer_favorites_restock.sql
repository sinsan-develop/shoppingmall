CREATE TABLE "customer_favorites" (
	"account_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_favorites_account_id_product_id_pk" PRIMARY KEY("account_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "restock_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"option_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	CONSTRAINT "restock_subscriptions_status_ck" CHECK ("restock_subscriptions"."status" IN ('active','cancelled','notified')),
	CONSTRAINT "restock_subscriptions_option_name_ck" CHECK (length(trim("restock_subscriptions"."option_name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "customer_favorites" ADD CONSTRAINT "customer_favorites_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_favorites" ADD CONSTRAINT "customer_favorites_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_subscriptions" ADD CONSTRAINT "restock_subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_subscriptions" ADD CONSTRAINT "restock_subscriptions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_favorites_product_idx" ON "customer_favorites" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "restock_subscriptions_active_uq" ON "restock_subscriptions" USING btree ("account_id","product_id","option_name") WHERE "restock_subscriptions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "restock_subscriptions_account_idx" ON "restock_subscriptions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "restock_subscriptions_product_idx" ON "restock_subscriptions" USING btree ("product_id");