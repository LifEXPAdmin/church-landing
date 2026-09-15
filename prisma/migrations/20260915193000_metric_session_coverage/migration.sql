-- Keep only the three most recent optional use-session starts, for at most 90 days.
ALTER TABLE "PlatformMeasurementChoice" ADD COLUMN "sessionStarts" TIMESTAMP(3)[] NOT NULL DEFAULT ARRAY[]::TIMESTAMP(3)[];
ALTER TABLE "PlatformMeasurementChoice" ADD CONSTRAINT "PlatformMeasurementChoice_sessions_check"
 CHECK (cardinality("sessionStarts") = "eligibleSessions" AND cardinality("sessionStarts") <= 3);
CREATE OR REPLACE FUNCTION gc_metric_choice_withdrawal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR NEW."enabledAt" IS NULL THEN
  DELETE FROM "PlatformMetricActivityDay" WHERE "userId"=OLD."userId";
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
-- Clear retained session starts together with a revoked account's optional choice.
CREATE FUNCTION gc_metric_choice_clear_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."enabledAt" IS NULL THEN NEW."sessionStarts":=ARRAY[]::TIMESTAMP(3)[]; NEW."eligibleSessions":=0; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "PlatformMeasurementChoice_clear_sessions" BEFORE UPDATE OR INSERT ON "PlatformMeasurementChoice"
 FOR EACH ROW EXECUTE FUNCTION gc_metric_choice_clear_sessions();
