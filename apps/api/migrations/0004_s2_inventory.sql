CREATE TABLE "inventory_levels" (
	"option_id" uuid PRIMARY KEY NOT NULL,
	"on_hand_quantity" integer DEFAULT 0 NOT NULL,
	"sellable_quantity" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_on_hand_ck" CHECK ("inventory_levels"."on_hand_quantity" >= 0),
	CONSTRAINT "inventory_sellable_ck" CHECK ("inventory_levels"."sellable_quantity" >= 0 AND "inventory_levels"."sellable_quantity" <= "inventory_levels"."on_hand_quantity")
);
--> statement-breakpoint
CREATE TABLE "stock_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"option_id" uuid NOT NULL,
	"target_on_hand" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by_account_id" uuid NOT NULL,
	"decided_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "stock_requests_target_ck" CHECK ("stock_change_requests"."target_on_hand" > 0),
	CONSTRAINT "stock_requests_status_ck" CHECK ("stock_change_requests"."status" IN ('pending','approved','superseded','rejected'))
);
--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_option_id_product_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."product_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_change_requests" ADD CONSTRAINT "stock_change_requests_option_id_product_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."product_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_change_requests" ADD CONSTRAINT "stock_change_requests_requested_by_account_id_accounts_id_fk" FOREIGN KEY ("requested_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_change_requests" ADD CONSTRAINT "stock_change_requests_decided_by_account_id_accounts_id_fk" FOREIGN KEY ("decided_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_requests_option_idx" ON "stock_change_requests" USING btree ("option_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_requests_one_pending_uq" ON "stock_change_requests" USING btree ("option_id") WHERE "stock_change_requests"."status" = 'pending';