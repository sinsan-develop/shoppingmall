CREATE TABLE "customer_cart_items" (
	"account_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_cart_items_account_id_option_id_pk" PRIMARY KEY("account_id","option_id"),
	CONSTRAINT "customer_cart_items_quantity_ck" CHECK ("customer_cart_items"."quantity" BETWEEN 1 AND 1000000)
);
--> statement-breakpoint
ALTER TABLE "customer_cart_items" ADD CONSTRAINT "customer_cart_items_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_cart_items" ADD CONSTRAINT "customer_cart_items_option_id_product_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."product_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_cart_items_option_idx" ON "customer_cart_items" USING btree ("option_id");