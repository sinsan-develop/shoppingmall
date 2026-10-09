DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM seller_settlement_periods) THEN
    RAISE EXCEPTION 'Cannot infer historical category for existing completed periods';
  END IF;
END;
$$;
--> statement-breakpoint
ALTER TABLE "seller_settlement_periods"
  ADD COLUMN "seller_category_id" uuid NOT NULL REFERENCES "seller_categories"("id"),
  ADD COLUMN "seller_category_name" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "seller_settlement_periods"
  ADD CONSTRAINT "seller_settlement_periods_category_name_ck"
  CHECK (length(trim("seller_category_name")) > 0);
