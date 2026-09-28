CREATE TABLE "product_sale_stop_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text NOT NULL,
	"requested_by_account_id" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_account_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	CONSTRAINT "product_sale_stops_status_ck" CHECK ("product_sale_stop_requests"."status" IN ('pending','approved','rejected')),
	CONSTRAINT "product_sale_stops_reason_ck" CHECK (length(trim("product_sale_stop_requests"."reason")) BETWEEN 1 AND 500)
);
--> statement-breakpoint
ALTER TABLE "product_sale_stop_requests" ADD CONSTRAINT "product_sale_stop_requests_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sale_stop_requests" ADD CONSTRAINT "product_sale_stop_requests_requested_by_account_id_accounts_id_fk" FOREIGN KEY ("requested_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sale_stop_requests" ADD CONSTRAINT "product_sale_stop_requests_decided_by_account_id_accounts_id_fk" FOREIGN KEY ("decided_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_sale_stops_product_idx" ON "product_sale_stop_requests" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_sale_stops_one_pending_uq" ON "product_sale_stop_requests" USING btree ("product_id") WHERE "product_sale_stop_requests"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "product_sale_stops_one_approved_uq" ON "product_sale_stop_requests" USING btree ("product_id") WHERE "product_sale_stop_requests"."status" = 'approved';