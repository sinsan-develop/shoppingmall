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
