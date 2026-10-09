DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM seller_settlement_periods) THEN
    RAISE EXCEPTION 'Cannot infer historical settlement event membership for existing completed periods';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE TABLE "seller_settlement_period_event_links" (
  "period_id" uuid NOT NULL REFERENCES "seller_settlement_periods"("id"),
  "event_id" uuid NOT NULL REFERENCES "settlement_events"("id"),
  CONSTRAINT "seller_settlement_period_event_links_pk" PRIMARY KEY ("period_id","event_id"),
  CONSTRAINT "seller_settlement_period_event_links_event_uq" UNIQUE ("event_id")
);
--> statement-breakpoint
CREATE FUNCTION validate_settlement_period_event_link() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM seller_settlement_periods period
    JOIN settlement_events event ON event.id = NEW.event_id
    WHERE period.id = NEW.period_id
      AND period.xmin::text::bigint = mod(txid_current(), 4294967296)
      AND period.seller_id = event.seller_id
      AND (event.occurred_at AT TIME ZONE 'Asia/Seoul')::date
        BETWEEN period.start_date AND period.end_date
  ) THEN
    RAISE EXCEPTION 'Settlement event does not belong to completed seller period'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER seller_settlement_period_event_links_valid
BEFORE INSERT ON "seller_settlement_period_event_links"
FOR EACH ROW EXECUTE FUNCTION validate_settlement_period_event_link();
--> statement-breakpoint
CREATE TRIGGER seller_settlement_period_event_links_immutable
BEFORE UPDATE OR DELETE ON "seller_settlement_period_event_links"
FOR EACH ROW EXECUTE FUNCTION prevent_settlement_history_change();
