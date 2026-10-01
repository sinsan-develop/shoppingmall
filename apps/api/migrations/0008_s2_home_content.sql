CREATE TABLE "home_content_current" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"publication_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "home_current_one_row_ck" CHECK ("home_content_current"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "home_content_draft" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb DEFAULT '{"menu":[],"events":[],"recommendations":[]}'::jsonb NOT NULL,
	"updated_by_account_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "home_draft_one_row_ck" CHECK ("home_content_draft"."id" = 1),
	CONSTRAINT "home_draft_version_ck" CHECK ("home_content_draft"."version" > 0),
	CONSTRAINT "home_draft_payload_ck" CHECK (jsonb_typeof("home_content_draft"."payload") = 'object')
);
--> statement-breakpoint
CREATE TABLE "home_content_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payload" jsonb NOT NULL,
	"published_by_account_id" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "home_publication_payload_ck" CHECK (jsonb_typeof("home_content_publications"."payload") = 'object')
);
--> statement-breakpoint
ALTER TABLE "home_content_current" ADD CONSTRAINT "home_content_current_publication_id_home_content_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."home_content_publications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_content_draft" ADD CONSTRAINT "home_content_draft_updated_by_account_id_accounts_id_fk" FOREIGN KEY ("updated_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_content_publications" ADD CONSTRAINT "home_content_publications_published_by_account_id_accounts_id_fk" FOREIGN KEY ("published_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "home_content_draft" DEFAULT VALUES;
--> statement-breakpoint
INSERT INTO "home_content_current" DEFAULT VALUES;
