DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM seller_settlement_periods) THEN
    RAISE EXCEPTION 'Cannot infer historical seller category for existing completed periods';
  END IF;
END;
$$;
--> statement-breakpoint
ALTER TABLE "seller_settlement_periods"
  ADD COLUMN "seller_category_id_at_completion" uuid NOT NULL
    REFERENCES "seller_categories"("id"),
  ADD COLUMN "seller_category_name_at_completion" text NOT NULL,
  ADD CONSTRAINT "seller_settlement_periods_category_name_ck"
    CHECK (length(trim("seller_category_name_at_completion")) > 0);
