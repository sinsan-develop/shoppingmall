ALTER TABLE "settlement_events"
  ADD COLUMN "original_event_id" uuid REFERENCES "settlement_events"("id"),
  ADD COLUMN "correction_direction" text;
--> statement-breakpoint
ALTER TABLE "settlement_events" ADD CONSTRAINT "settlement_events_correction_link_ck"
  CHECK (
    ("kind" = 'correction' AND "original_event_id" IS NOT NULL
      AND "correction_direction" IN ('increase','decrease'))
    OR ("kind" <> 'correction' AND "original_event_id" IS NULL
      AND "correction_direction" IS NULL)
  );
--> statement-breakpoint
CREATE INDEX "settlement_events_original_idx"
  ON "settlement_events" ("original_event_id")
  WHERE "original_event_id" IS NOT NULL;
--> statement-breakpoint
CREATE FUNCTION validate_settlement_correction() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE original settlement_events%ROWTYPE;
BEGIN
  IF NEW.kind <> 'correction' THEN RETURN NEW; END IF;
  SELECT * INTO original FROM settlement_events WHERE id = NEW.original_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement correction original event is invalid' USING ERRCODE = '23514';
  END IF;
  IF original.kind = 'correction'
    OR original.seller_id IS DISTINCT FROM NEW.seller_id
    OR original.seller_name IS DISTINCT FROM NEW.seller_name
    OR original.seller_category_id IS DISTINCT FROM NEW.seller_category_id
    OR original.seller_category_name IS DISTINCT FROM NEW.seller_category_name THEN
    RAISE EXCEPTION 'Settlement correction original event mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER settlement_events_correction_original_valid
BEFORE INSERT ON "settlement_events"
FOR EACH ROW EXECUTE FUNCTION validate_settlement_correction();
