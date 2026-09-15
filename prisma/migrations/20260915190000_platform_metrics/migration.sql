-- Operational aggregates contain no account identity; optional collection begins off.
ALTER TABLE "PlatformUser" ADD COLUMN "metricCreationMethod" TEXT NOT NULL DEFAULT 'UNKNOWN', ADD COLUMN "metricExcluded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlatformUser" ADD CONSTRAINT "PlatformUser_metricCreationMethod_check" CHECK ("metricCreationMethod" IN ('UNKNOWN','EMAIL','GOOGLE'));
CREATE TABLE "PlatformMetricConfiguration" (
  version INTEGER PRIMARY KEY, zone TEXT NOT NULL, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "openingStates" JSONB NOT NULL,
  CONSTRAINT "PlatformMetricConfiguration_version_check" CHECK (version > 0)
);
CREATE TABLE "PlatformMetricLifecycleDay" (
  version INTEGER NOT NULL REFERENCES "PlatformMetricConfiguration"(version) ON DELETE RESTRICT,
  day DATE NOT NULL, "fromState" TEXT NOT NULL, "toState" TEXT NOT NULL, reason TEXT NOT NULL, method TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count > 0),
  PRIMARY KEY (version,day,"fromState","toState",reason,method),
  CHECK ("fromState" IN ('ABSENT','ENABLED','DEACTIVATED','SUSPENDED','DELETED','EXCLUDED')),
  CHECK ("toState" IN ('ABSENT','ENABLED','DEACTIVATED','SUSPENDED','DELETED','EXCLUDED')),
  CHECK (reason IN ('CREATED','DEACTIVATED','REACTIVATED','SUSPENDED','RESTORED','DELETED','EXCLUDED','REINCLUDED')),
  CHECK (method IN ('UNKNOWN','EMAIL','GOOGLE')),
  CHECK ("fromState" <> "toState")
);
CREATE TABLE "PlatformMeasurementChoice" (
  "userId" TEXT PRIMARY KEY REFERENCES "PlatformUser"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0), policy TEXT NOT NULL,
  "enabledAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL,
  "shareDevice" BOOLEAN NOT NULL DEFAULT false, referral TEXT NOT NULL DEFAULT 'UNKNOWN',
  "lastForegroundAt" TIMESTAMP(3), "eligibleSessions" INTEGER NOT NULL DEFAULT 0 CHECK ("eligibleSessions" BETWEEN 0 AND 3),
  CHECK (referral IN ('UNKNOWN','PERSONAL_INVITATION','CHURCH','SEARCH','SOCIAL','OTHER')),
  CHECK ("enabledAt" IS NOT NULL OR (NOT "shareDevice" AND referral='UNKNOWN' AND "lastForegroundAt" IS NULL AND "eligibleSessions"=0))
);
CREATE TABLE "PlatformMetricActivityDay" (
  "userId" TEXT NOT NULL REFERENCES "PlatformUser"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  version INTEGER NOT NULL REFERENCES "PlatformMetricConfiguration"(version) ON DELETE RESTRICT,
  day DATE NOT NULL, "firstAt" TIMESTAMP(3) NOT NULL, "lastAt" TIMESTAMP(3) NOT NULL,
  device TEXT NOT NULL DEFAULT 'UNKNOWN', browser TEXT NOT NULL DEFAULT 'UNKNOWN',
  PRIMARY KEY ("userId",version,day), CHECK ("lastAt">="firstAt"),
  CHECK (device IN ('UNKNOWN','PHONE','TABLET','COMPUTER')),
  CHECK (browser IN ('UNKNOWN','SAFARI','CHROME','EDGE','FIREFOX','OTHER'))
);
CREATE INDEX "PlatformMetricActivityDay_version_day_userId_idx" ON "PlatformMetricActivityDay"(version,day,"userId");
CREATE INDEX "PlatformMetricActivityDay_lastAt_idx" ON "PlatformMetricActivityDay"("lastAt");

CREATE FUNCTION gc_metric_account_state(u "PlatformUser") RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
 SELECT CASE WHEN u."erasedAt" IS NOT NULL THEN 'DELETED'
 WHEN u."metricExcluded" THEN 'EXCLUDED'
 WHEN u."suspendedAt" IS NOT NULL THEN 'SUSPENDED'
 WHEN u."deactivatedAt" IS NOT NULL THEN 'DEACTIVATED' ELSE 'ENABLED' END
$$;
-- Existing timestamps can be counted, but no historical method or transition is inferred.
INSERT INTO "PlatformMetricConfiguration"(version,zone,"openingStates")
SELECT 1,'America/Chicago',jsonb_build_object(
 'ENABLED',count(*) FILTER(WHERE gc_metric_account_state(u)='ENABLED'),
 'DEACTIVATED',count(*) FILTER(WHERE gc_metric_account_state(u)='DEACTIVATED'),
 'SUSPENDED',count(*) FILTER(WHERE gc_metric_account_state(u)='SUSPENDED')) FROM "PlatformUser" u;

CREATE FUNCTION gc_metric_configuration_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Metric reporting boundaries are immutable; use a reviewed new collection version and baseline';
END $$;
CREATE TRIGGER "PlatformMetricConfiguration_immutable" BEFORE UPDATE OR DELETE ON "PlatformMetricConfiguration"
 FOR EACH ROW EXECUTE FUNCTION gc_metric_configuration_immutable();

CREATE FUNCTION gc_metric_method_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."metricCreationMethod" IS DISTINCT FROM OLD."metricCreationMethod" AND NEW."erasedAt" IS NULL THEN
  RAISE EXCEPTION 'Original signup method cannot be inferred or changed by linking credentials';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "PlatformUser_metric_method_immutable" BEFORE UPDATE ON "PlatformUser"
 FOR EACH ROW EXECUTE FUNCTION gc_metric_method_immutable();

CREATE FUNCTION gc_metric_account_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous TEXT; current TEXT; why TEXT; source_method TEXT; cfg "PlatformMetricConfiguration";
BEGIN
 previous:=CASE WHEN TG_OP='INSERT' THEN 'ABSENT' ELSE gc_metric_account_state(OLD) END;
 current:=CASE WHEN TG_OP='DELETE' THEN 'DELETED' ELSE gc_metric_account_state(NEW) END;
 source_method:=CASE WHEN TG_OP='INSERT' THEN NEW."metricCreationMethod" ELSE OLD."metricCreationMethod" END;
 IF previous<>current AND NOT (previous='ABSENT' AND current='EXCLUDED') AND NOT (previous='EXCLUDED' AND current='DELETED') THEN
  why:=CASE WHEN TG_OP='INSERT' THEN 'CREATED' WHEN current='DELETED' THEN 'DELETED'
   WHEN current='EXCLUDED' THEN 'EXCLUDED' WHEN previous='EXCLUDED' THEN 'REINCLUDED'
   WHEN current='SUSPENDED' THEN 'SUSPENDED' WHEN previous='SUSPENDED' THEN 'RESTORED'
   WHEN current='DEACTIVATED' THEN 'DEACTIVATED' ELSE 'REACTIVATED' END;
  SELECT * INTO STRICT cfg FROM "PlatformMetricConfiguration" ORDER BY version DESC LIMIT 1;
  INSERT INTO "PlatformMetricLifecycleDay"(version,day,"fromState","toState",reason,method,count)
   VALUES (cfg.version,(CURRENT_TIMESTAMP AT TIME ZONE cfg.zone)::date,previous,current,why,source_method,1)
   ON CONFLICT(version,day,"fromState","toState",reason,method) DO UPDATE SET count="PlatformMetricLifecycleDay".count+1;
 END IF;
 IF TG_OP<>'DELETE' AND current<>'ENABLED' THEN
  DELETE FROM "PlatformMetricActivityDay" WHERE "userId"=NEW.id;
  UPDATE "PlatformMeasurementChoice" SET "enabledAt"=NULL,"shareDevice"=false,referral='UNKNOWN',
   "lastForegroundAt"=NULL,"eligibleSessions"=0,version=version+1,"updatedAt"=CURRENT_TIMESTAMP
   WHERE "userId"=NEW.id AND "enabledAt" IS NOT NULL;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER "PlatformUser_metric_transition" AFTER INSERT OR UPDATE OR DELETE ON "PlatformUser"
 FOR EACH ROW EXECUTE FUNCTION gc_metric_account_transition();

-- Even a direct trusted choice withdrawal cannot leave optional daily facts behind.
CREATE FUNCTION gc_metric_choice_withdrawal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR NEW."enabledAt" IS NULL THEN
  DELETE FROM "PlatformMetricActivityDay" WHERE "userId"=OLD."userId";
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER "PlatformMeasurementChoice_withdrawal" AFTER UPDATE OR DELETE ON "PlatformMeasurementChoice"
 FOR EACH ROW EXECUTE FUNCTION gc_metric_choice_withdrawal();
