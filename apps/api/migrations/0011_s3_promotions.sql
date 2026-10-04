CREATE TABLE "promotion_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "kind" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "direct_issue_limit" integer,
  "total_use_limit" integer NOT NULL,
  "per_account_use_limit" integer NOT NULL,
  "created_by_account_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "stopped_by_account_id" uuid,
  "stopped_at" timestamp with time zone,
  "stop_reason" text,
  CONSTRAINT "promotion_campaigns_title_ck" CHECK (length(trim("title")) BETWEEN 1 AND 160),
  CONSTRAINT "promotion_campaigns_kind_ck" CHECK ("kind" IN ('goods_discount','shipping_support')),
  CONSTRAINT "promotion_campaigns_status_ck" CHECK ("status" IN ('active','stopped')),
  CONSTRAINT "promotion_campaigns_limits_ck" CHECK (("direct_issue_limit" IS NULL OR "direct_issue_limit" > 0) AND "total_use_limit" > 0 AND "per_account_use_limit" > 0),
  CONSTRAINT "promotion_campaigns_stop_ck" CHECK (("status" = 'active' AND "stopped_at" IS NULL AND "stopped_by_account_id" IS NULL AND "stop_reason" IS NULL) OR ("status" = 'stopped' AND "stopped_at" IS NOT NULL AND "stopped_by_account_id" IS NOT NULL AND length(trim(coalesce("stop_reason",''))) BETWEEN 1 AND 500))
);
--> statement-breakpoint
CREATE TABLE "promotion_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "scope" text NOT NULL,
  "target_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "minimum_eligible_goods_won" integer DEFAULT 0 NOT NULL,
  "amount_kind" text NOT NULL,
  "amount_value" integer NOT NULL,
  "max_discount_won" integer,
  "created_by_account_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "promotion_versions_version_ck" CHECK ("version" > 0),
  CONSTRAINT "promotion_versions_scope_ck" CHECK ("scope" IN ('all','sellers','options')),
  CONSTRAINT "promotion_versions_targets_ck" CHECK (array_position("target_ids", NULL) IS NULL AND (("scope" = 'all' AND cardinality("target_ids") = 0) OR ("scope" <> 'all' AND cardinality("target_ids") > 0))),
  CONSTRAINT "promotion_versions_period_ck" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "promotion_versions_minimum_ck" CHECK ("minimum_eligible_goods_won" >= 0),
  CONSTRAINT "promotion_versions_amount_ck" CHECK (("amount_kind" = 'fixed' AND "amount_value" > 0) OR ("amount_kind" = 'percent' AND "amount_value" BETWEEN 1 AND 10000 AND "max_discount_won" IS NOT NULL)),
  CONSTRAINT "promotion_versions_cap_ck" CHECK ("max_discount_won" IS NULL OR "max_discount_won" > 0)
);
--> statement-breakpoint
CREATE TABLE "promotion_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "version_id" uuid NOT NULL,
  "code" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "promotion_codes_normalized_ck" CHECK ("code" ~ '^[A-Z0-9_-]{4,40}$')
);
--> statement-breakpoint
CREATE TABLE "promotion_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "version_id" uuid NOT NULL,
  "source" text NOT NULL,
  "issued_by_account_id" uuid,
  "idempotency_key" uuid,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "promotion_grants_source_ck" CHECK ("source" IN ('direct','code')),
  CONSTRAINT "promotion_grants_actor_ck" CHECK (("source" = 'direct' AND "issued_by_account_id" IS NOT NULL AND "idempotency_key" IS NOT NULL AND length(trim(coalesce("reason",''))) BETWEEN 1 AND 500) OR ("source" = 'code' AND "issued_by_account_id" IS NULL AND "idempotency_key" IS NULL AND "reason" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "promotion_uses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "version_id" uuid NOT NULL,
  "grant_id" uuid NOT NULL,
  "reservation_id" uuid NOT NULL,
  "shipment_key" text,
  "status" text DEFAULT 'HELD' NOT NULL,
  "idempotency_key" uuid NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "held_at" timestamp with time zone DEFAULT now() NOT NULL,
  "used_at" timestamp with time zone,
  "released_at" timestamp with time zone,
  "release_reason" text,
  CONSTRAINT "promotion_uses_status_ck" CHECK ("status" IN ('HELD','USED','RELEASED')),
  CONSTRAINT "promotion_uses_shipment_ck" CHECK ("shipment_key" IS NULL OR length(trim("shipment_key")) > 0),
  CONSTRAINT "promotion_uses_dates_ck" CHECK (("status" = 'HELD' AND "used_at" IS NULL AND "released_at" IS NULL AND "release_reason" IS NULL) OR ("status" = 'USED' AND "used_at" IS NOT NULL AND "released_at" IS NULL) OR ("status" = 'RELEASED' AND "released_at" IS NOT NULL AND length(trim(coalesce("release_reason",''))) BETWEEN 1 AND 500))
);
--> statement-breakpoint
ALTER TABLE "promotion_campaigns" ADD CONSTRAINT "promotion_campaigns_created_by_accounts_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id");
--> statement-breakpoint
ALTER TABLE "promotion_campaigns" ADD CONSTRAINT "promotion_campaigns_stopped_by_accounts_fk" FOREIGN KEY ("stopped_by_account_id") REFERENCES "public"."accounts"("id");
--> statement-breakpoint
ALTER TABLE "promotion_versions" ADD CONSTRAINT "promotion_versions_campaign_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."promotion_campaigns"("id");
--> statement-breakpoint
ALTER TABLE "promotion_versions" ADD CONSTRAINT "promotion_versions_created_by_accounts_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id");
--> statement-breakpoint
ALTER TABLE "promotion_codes" ADD CONSTRAINT "promotion_codes_version_fk" FOREIGN KEY ("version_id") REFERENCES "public"."promotion_versions"("id");
--> statement-breakpoint
ALTER TABLE "promotion_grants" ADD CONSTRAINT "promotion_grants_account_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");
--> statement-breakpoint
ALTER TABLE "promotion_grants" ADD CONSTRAINT "promotion_grants_version_fk" FOREIGN KEY ("version_id") REFERENCES "public"."promotion_versions"("id");
--> statement-breakpoint
ALTER TABLE "promotion_grants" ADD CONSTRAINT "promotion_grants_issued_by_fk" FOREIGN KEY ("issued_by_account_id") REFERENCES "public"."accounts"("id");
--> statement-breakpoint
ALTER TABLE "promotion_uses" ADD CONSTRAINT "promotion_uses_account_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");
--> statement-breakpoint
ALTER TABLE "promotion_uses" ADD CONSTRAINT "promotion_uses_campaign_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."promotion_campaigns"("id");
--> statement-breakpoint
ALTER TABLE "promotion_uses" ADD CONSTRAINT "promotion_uses_version_fk" FOREIGN KEY ("version_id") REFERENCES "public"."promotion_versions"("id");
--> statement-breakpoint
ALTER TABLE "promotion_uses" ADD CONSTRAINT "promotion_uses_grant_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."promotion_grants"("id");
--> statement-breakpoint
ALTER TABLE "promotion_uses" ADD CONSTRAINT "promotion_uses_reservation_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."checkout_reservations"("id");
--> statement-breakpoint
CREATE INDEX "promotion_campaigns_status_idx" ON "promotion_campaigns" ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_versions_campaign_version_uq" ON "promotion_versions" ("campaign_id","version");
--> statement-breakpoint
CREATE INDEX "promotion_versions_period_idx" ON "promotion_versions" ("starts_at","ends_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_codes_code_uq" ON "promotion_codes" ("code");
--> statement-breakpoint
CREATE INDEX "promotion_codes_version_idx" ON "promotion_codes" ("version_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_grants_account_version_source_uq" ON "promotion_grants" ("account_id","version_id","source");
--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_grants_actor_key_uq" ON "promotion_grants" ("issued_by_account_id","idempotency_key") WHERE "source" = 'direct';
--> statement-breakpoint
CREATE INDEX "promotion_grants_version_idx" ON "promotion_grants" ("version_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_uses_reservation_campaign_shipment_uq" ON "promotion_uses" ("reservation_id","campaign_id",coalesce("shipment_key",'')) WHERE "status" IN ('HELD','USED');
--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_uses_account_key_campaign_shipment_uq" ON "promotion_uses" ("account_id","idempotency_key","campaign_id",coalesce("shipment_key",''));
--> statement-breakpoint
CREATE INDEX "promotion_uses_campaign_status_idx" ON "promotion_uses" ("campaign_id","status");
--> statement-breakpoint
CREATE INDEX "promotion_uses_account_campaign_idx" ON "promotion_uses" ("account_id","campaign_id");
--> statement-breakpoint
CREATE INDEX "promotion_uses_due_idx" ON "promotion_uses" ("status","expires_at");
