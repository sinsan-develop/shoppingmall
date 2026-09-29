CREATE TABLE "seller_shipping_policies" (
	"seller_id" uuid PRIMARY KEY NOT NULL,
	"policy" jsonb NOT NULL,
	"approved_request_id" uuid NOT NULL,
	"approved_by_account_id" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_shipping_policy_ck" CHECK (jsonb_typeof("seller_shipping_policies"."policy") = 'object')
);
--> statement-breakpoint
CREATE TABLE "seller_shipping_policy_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"policy" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by_account_id" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_account_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	CONSTRAINT "shipping_requests_status_ck" CHECK ("seller_shipping_policy_requests"."status" IN ('pending','approved','rejected')),
	CONSTRAINT "shipping_requests_policy_ck" CHECK (jsonb_typeof("seller_shipping_policy_requests"."policy") = 'object')
);
--> statement-breakpoint
CREATE TABLE "shipping_policy_global" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"fee_won" integer DEFAULT 3000 NOT NULL,
	"free_threshold_won" integer DEFAULT 50000 NOT NULL,
	"cutoff_time" text,
	"blocked_postal_ranges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locked_fee" boolean DEFAULT false NOT NULL,
	"locked_threshold" boolean DEFAULT false NOT NULL,
	"locked_cutoff" boolean DEFAULT false NOT NULL,
	"updated_by_account_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_global_one_row_ck" CHECK ("shipping_policy_global"."id" = 1),
	CONSTRAINT "shipping_global_money_ck" CHECK ("shipping_policy_global"."fee_won" BETWEEN 0 AND 1000000000 AND "shipping_policy_global"."free_threshold_won" BETWEEN 0 AND 1000000000),
	CONSTRAINT "shipping_global_cutoff_ck" CHECK ("shipping_policy_global"."cutoff_time" IS NULL OR "shipping_policy_global"."cutoff_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "shipping_global_ranges_ck" CHECK (jsonb_typeof("shipping_policy_global"."blocked_postal_ranges") = 'array')
);
--> statement-breakpoint
ALTER TABLE "seller_shipping_policies" ADD CONSTRAINT "seller_shipping_policies_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_shipping_policies" ADD CONSTRAINT "seller_shipping_policies_approved_request_id_seller_shipping_policy_requests_id_fk" FOREIGN KEY ("approved_request_id") REFERENCES "public"."seller_shipping_policy_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_shipping_policies" ADD CONSTRAINT "seller_shipping_policies_approved_by_account_id_accounts_id_fk" FOREIGN KEY ("approved_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_shipping_policy_requests" ADD CONSTRAINT "seller_shipping_policy_requests_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_shipping_policy_requests" ADD CONSTRAINT "seller_shipping_policy_requests_requested_by_account_id_accounts_id_fk" FOREIGN KEY ("requested_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_shipping_policy_requests" ADD CONSTRAINT "seller_shipping_policy_requests_decided_by_account_id_accounts_id_fk" FOREIGN KEY ("decided_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_policy_global" ADD CONSTRAINT "shipping_policy_global_updated_by_account_id_accounts_id_fk" FOREIGN KEY ("updated_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipping_requests_seller_idx" ON "seller_shipping_policy_requests" USING btree ("seller_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_requests_one_pending_uq" ON "seller_shipping_policy_requests" USING btree ("seller_id") WHERE "seller_shipping_policy_requests"."status" = 'pending';
--> statement-breakpoint
INSERT INTO "shipping_policy_global" ("id") VALUES (1);
