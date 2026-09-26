CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_categories_name_ck" CHECK (length(trim("product_categories"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "seller_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_categories_name_unique" UNIQUE("name"),
	CONSTRAINT "seller_categories_name_ck" CHECK (length(trim("seller_categories"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "category_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_id_product_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."product_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_root_name_uq" ON "product_categories" USING btree ("name") WHERE "product_categories"."parent_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_child_name_uq" ON "product_categories" USING btree ("parent_id","name") WHERE "product_categories"."parent_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "product_categories_parent_idx" ON "product_categories" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_category_id_seller_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."seller_categories"("id") ON DELETE no action ON UPDATE no action;