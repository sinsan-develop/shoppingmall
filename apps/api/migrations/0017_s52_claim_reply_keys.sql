ALTER TABLE "support_claim_messages" ADD COLUMN "idempotency_key" uuid;
--> statement-breakpoint
CREATE UNIQUE INDEX "support_claim_messages_author_key_uq"
  ON "support_claim_messages" ("author_account_id","idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
