ALTER TABLE "support_claim_evidence" ADD COLUMN "idempotency_key" uuid;
--> statement-breakpoint
ALTER TABLE "support_claim_evidence" ADD COLUMN "request_sha256" text;
--> statement-breakpoint
ALTER TABLE "support_claim_evidence" ADD CONSTRAINT "support_claim_evidence_request_ck"
  CHECK (("idempotency_key" IS NULL AND "request_sha256" IS NULL)
    OR ("idempotency_key" IS NOT NULL AND "request_sha256" ~ '^[0-9a-f]{64}$'));
--> statement-breakpoint
CREATE UNIQUE INDEX "support_claim_evidence_author_key_uq"
  ON "support_claim_evidence" ("uploaded_by","idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_claims" ADD COLUMN "decision_idempotency_key" uuid;
--> statement-breakpoint
ALTER TABLE "support_claims" ADD COLUMN "decision_fingerprint" text;
--> statement-breakpoint
ALTER TABLE "support_claims" ADD COLUMN "goods_refund_won" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_claims" ADD CONSTRAINT "support_claims_decision_key_ck" CHECK (
  ("status" IN ('REQUESTED','SELLER_REPLIED') AND "decision_idempotency_key" IS NULL
    AND "decision_fingerprint" IS NULL AND "goods_refund_won" = 0)
  OR ("status" NOT IN ('REQUESTED','SELLER_REPLIED')
    AND "decision_idempotency_key" IS NOT NULL
    AND "decision_fingerprint" ~ '^[0-9a-f]{64}$' AND "goods_refund_won" >= 0));
--> statement-breakpoint
CREATE UNIQUE INDEX "support_claims_decision_author_key_uq"
  ON "support_claims" ("decision_by","decision_idempotency_key")
  WHERE "decision_idempotency_key" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_claim_events" DROP CONSTRAINT "support_claim_events_action_ck";
--> statement-breakpoint
ALTER TABLE "support_claim_events" ADD CONSTRAINT "support_claim_events_action_ck"
  CHECK ("action" IN ('REQUESTED','SELLER_REPLIED','EVIDENCE_ADDED','APPROVED','REJECTED',
    'REFUND_PROCESSING','REFUNDED','REVIEW_REQUIRED'));
