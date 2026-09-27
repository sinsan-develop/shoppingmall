CREATE TYPE "public"."product_image_purpose" AS ENUM('thumbnail', 'detail');--> statement-breakpoint
CREATE TYPE "public"."product_proposal_status" AS ENUM('draft', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."product_shipping_mode" AS ENUM('seller_direct', 'owool_fulfillment');--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"purpose" "product_image_purpose" NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_images_size_ck" CHECK ("product_images"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_won" integer NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_options_name_ck" CHECK (length(trim("product_options"."name")) > 0),
	CONSTRAINT "product_options_price_ck" CHECK ("product_options"."price_won" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_publications" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"revision_id" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by_account_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"origin_label" text NOT NULL,
	"shipping_mode" "product_shipping_mode" NOT NULL,
	"status" "product_proposal_status" DEFAULT 'draft' NOT NULL,
	"proposed_by_account_id" uuid NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by_account_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_reason" text,
	CONSTRAINT "product_revisions_version_ck" CHECK ("product_revisions"."version" > 0),
	CONSTRAINT "product_revisions_title_ck" CHECK (length(trim("product_revisions"."title")) > 0),
	CONSTRAINT "product_revisions_origin_ck" CHECK (length(trim("product_revisions"."origin_label")) > 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "product_revisions_product_id_uq" ON "product_revisions" USING btree ("product_id","id");--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_revision_id_product_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."product_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_revision_id_product_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."product_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_publications" ADD CONSTRAINT "product_publications_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_publications" ADD CONSTRAINT "product_publications_published_by_account_id_accounts_id_fk" FOREIGN KEY ("published_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_publications" ADD CONSTRAINT "product_publications_product_id_revision_id_product_revisions_product_id_id_fk" FOREIGN KEY ("product_id","revision_id") REFERENCES "public"."product_revisions"("product_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_revisions" ADD CONSTRAINT "product_revisions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_revisions" ADD CONSTRAINT "product_revisions_proposed_by_account_id_accounts_id_fk" FOREIGN KEY ("proposed_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_revisions" ADD CONSTRAINT "product_revisions_reviewed_by_account_id_accounts_id_fk" FOREIGN KEY ("reviewed_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_revision_key_uq" ON "product_images" USING btree ("revision_id","object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "product_options_revision_name_uq" ON "product_options" USING btree ("revision_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "product_publications_revision_uq" ON "product_publications" USING btree ("revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_revisions_product_version_uq" ON "product_revisions" USING btree ("product_id","version");--> statement-breakpoint
CREATE INDEX "product_revisions_status_idx" ON "product_revisions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_seller_idx" ON "products" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");
