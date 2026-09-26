-- A sibling occurrence edit must not invalidate this occurrence's reminder.
-- Existing rows start conservatively at migration time. Preferences default Off.
ALTER TABLE "CalendarOccurrence" ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Keep the timestamp current when a compatible older application writes during
-- rollback and does not know this additive column. Current Prisma writes provide it.
CREATE FUNCTION calendar_occurrence_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."updatedAt" IS NOT DISTINCT FROM OLD."updatedAt" THEN
    NEW."updatedAt" := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER calendar_occurrence_touch BEFORE UPDATE ON "CalendarOccurrence"
FOR EACH ROW EXECUTE FUNCTION calendar_occurrence_touch();
