-- Assigning operational access ends optional member measurement coverage.
-- Revocation never silently opts the former operator back in.
CREATE FUNCTION gc_metric_operator_retire() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."revokedAt" IS NULL THEN
    DELETE FROM "PlatformMetricActivityDay" WHERE "userId"=NEW."userId";
    UPDATE "PlatformMeasurementChoice" SET "enabledAt"=NULL,version=version+1
      WHERE "userId"=NEW."userId" AND "enabledAt" IS NOT NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gc_metric_platform_operator AFTER INSERT OR UPDATE OF "revokedAt" ON "PlatformOperatorGrant"
  FOR EACH ROW EXECUTE FUNCTION gc_metric_operator_retire();
CREATE TRIGGER gc_metric_support_operator AFTER INSERT OR UPDATE OF "revokedAt" ON "SupportCapabilityGrant"
  FOR EACH ROW EXECUTE FUNCTION gc_metric_operator_retire();
UPDATE "PlatformMeasurementChoice" p SET "enabledAt"=NULL,version=version+1 WHERE "enabledAt" IS NOT NULL AND
  (EXISTS(SELECT 1 FROM "PlatformOperatorGrant" g WHERE g."userId"=p."userId" AND g."revokedAt" IS NULL)
    OR EXISTS(SELECT 1 FROM "SupportCapabilityGrant" g WHERE g."userId"=p."userId" AND g."revokedAt" IS NULL));
