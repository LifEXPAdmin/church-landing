ALTER TABLE "PostVolunteerSignup"
  ADD COLUMN "completionVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "completionNote" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "serviceVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "serviceSharedAt" TIMESTAMP(3),
  ADD COLUMN "serviceSharedCompletionVersion" INTEGER,
  ADD COLUMN "serviceRecoveryRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VolunteerApplication"
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "completionVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "completionNote" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "serviceVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "serviceSharedAt" TIMESTAMP(3),
  ADD COLUMN "serviceSharedCompletionVersion" INTEGER,
  ADD COLUMN "serviceRecoveryRequired" BOOLEAN NOT NULL DEFAULT false;

-- Retain every existing confirmation. Migration never supplies profile consent.
UPDATE "PostVolunteerSignup" SET "completionVersion"=1 WHERE "completedAt" IS NOT NULL;
ALTER TABLE "PostVolunteerSignup" ADD CONSTRAINT "PostVolunteerSignup_service_bounds" CHECK (
  "completionVersion">=0 AND "serviceVersion">=0 AND length("completionNote")<=500
  AND (("serviceSharedAt" IS NULL AND "serviceSharedCompletionVersion" IS NULL) OR
    ("serviceSharedAt" IS NOT NULL AND "serviceSharedCompletionVersion" IS NOT NULL
      AND "serviceSharedCompletionVersion"="completionVersion" AND "completionVersion">0
      AND "completedAt" IS NOT NULL AND state='ACTIVE' AND NOT "serviceRecoveryRequired")));
ALTER TABLE "VolunteerApplication" ADD CONSTRAINT "VolunteerApplication_service_bounds" CHECK (
  "completionVersion">=0 AND "serviceVersion">=0 AND length("completionNote")<=500
  AND ("signupId" IS NULL OR "completedAt" IS NULL)
  AND (("serviceSharedAt" IS NULL AND "serviceSharedCompletionVersion" IS NULL) OR
    ("serviceSharedAt" IS NOT NULL AND "serviceSharedCompletionVersion" IS NOT NULL
      AND "serviceSharedCompletionVersion"="completionVersion" AND "completionVersion">0
      AND "completedAt" IS NOT NULL AND state='ACCEPTED' AND "userId" IS NOT NULL
      AND NOT "recoveryRequired" AND NOT "serviceRecoveryRequired")));

ALTER TABLE "VolunteerApplicationEvent" DROP CONSTRAINT "VolunteerApplicationEvent_bounds";
ALTER TABLE "VolunteerApplicationEvent" ADD CONSTRAINT "VolunteerApplicationEvent_bounds" CHECK (
  version>0 AND length(note)<=500 AND action IN
  ('SUBMITTED','WITHDRAWN','DECLINED','ACCEPTED','CANCELED','AVAILABILITY_UPDATED','COMPLETED','COMPLETION_CORRECTED'));

-- Extend the current predicates verbatim, including every previously accepted
-- kind and its original scope, rather than replacing them with an older list.
DO $$
DECLARE constraint_name text; definition text; extended text;
BEGIN
  FOREACH constraint_name IN ARRAY ARRAY['RetentionControl_kind_check','RetentionControl_account_scope'] LOOP
    SELECT pg_get_constraintdef(oid) INTO STRICT definition FROM pg_constraint
      WHERE conrelid='"RetentionControl"'::regclass AND conname=constraint_name;
    extended := replace(definition, '''VOLUNTEER_APPLICATION''::text',
      '''VOLUNTEER_APPLICATION''::text, ''VOLUNTEER_SERVICE_SIGNUP''::text, ''VOLUNTEER_SERVICE_APPLICATION''::text');
    IF extended=definition THEN RAISE EXCEPTION 'Missing current volunteer recovery predicate'; END IF;
    EXECUTE format('ALTER TABLE "RetentionControl" DROP CONSTRAINT %I', constraint_name);
    EXECUTE format('ALTER TABLE "RetentionControl" ADD CONSTRAINT %I %s', constraint_name, extended);
  END LOOP;
END;
$$;

-- Older compatible writers cannot keep unseen consent when correcting or
-- ending an assignment. Persist an opaque recovery control when this trigger
-- has to supply the missing revision. Current writers supply their own control.
CREATE FUNCTION volunteer_service_legacy_control(kind_value text, owner_value text,
  source_value text, version_value integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE control_id text := gen_random_uuid()::text;
  stamp timestamptz := date_trunc('milliseconds',clock_timestamp());
  stamp_text text; due_text text;
BEGIN
  IF owner_value IS NULL THEN RETURN; END IF;
  stamp_text := to_char(stamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  due_text := to_char((stamp+interval '2160 hours') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  INSERT INTO "RetentionControl" (id,target,"targetId","sourceId",kind,version,payload,"createdAt")
  VALUES (control_id,'ACCOUNT',owner_value,source_value,kind_value,version_value,
    jsonb_build_object('id',control_id,'target','ACCOUNT','targetId',owner_value,'sourceId',source_value,
      'kind',kind_value,'version',version_value,'policy','GC-MSG-RETENTION-v1','outcome','QUARANTINED',
      'operatorId',owner_value,'recordedAt',stamp_text,'startedAt',stamp_text,'reviewDueAt',due_text,'endedAt',NULL),stamp)
  ON CONFLICT (kind,"sourceId",version) DO NOTHING;
END;
$$;

CREATE FUNCTION volunteer_service_scrub() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE invalidated boolean := false; legacy boolean := false; changed_source boolean;
  completion_changed boolean; historical boolean; new_json jsonb; control_kind text;
BEGIN
  new_json := to_jsonb(NEW);
  completion_changed := NEW."completedAt" IS DISTINCT FROM OLD."completedAt"
    OR NEW."completionVersion" IS DISTINCT FROM OLD."completionVersion";
  historical := OLD."completedAt" IS NOT NULL OR OLD."completionVersion">0
    OR OLD."serviceSharedAt" IS NOT NULL OR OLD."serviceRecoveryRequired";
  changed_source := NEW."userId" IS DISTINCT FROM OLD."userId";
  IF TG_TABLE_NAME='PostVolunteerSignup' THEN
    control_kind := 'VOLUNTEER_SERVICE_SIGNUP';
    changed_source := changed_source OR NEW."slotId" IS DISTINCT FROM OLD."slotId"
      OR (NEW.state<>'ACTIVE' AND NEW.state IS DISTINCT FROM OLD.state);
  ELSE
    control_kind := 'VOLUNTEER_SERVICE_APPLICATION';
    changed_source := changed_source OR NEW."opportunityId" IS DISTINCT FROM OLD."opportunityId"
      OR NEW."signupId" IS DISTINCT FROM OLD."signupId"
      OR (NEW.state<>'ACCEPTED' AND NEW.state IS DISTINCT FROM OLD.state)
      OR (NEW."recoveryRequired" AND NOT OLD."recoveryRequired");
  END IF;
  IF completion_changed THEN
    invalidated := true;
    IF NOT (NEW."completionVersion"=OLD."completionVersion"+1
      AND NEW."serviceVersion"=OLD."serviceVersion"+1 AND NEW.version=OLD.version+1) THEN
      NEW."completionVersion" := greatest(NEW."completionVersion",OLD."completionVersion"+1);
      NEW."serviceRecoveryRequired" := true;
      legacy := true;
    END IF;
  END IF;
  IF historical AND changed_source THEN
    invalidated := true;
    NEW."serviceRecoveryRequired" := true;
  END IF;
  IF NEW."serviceRecoveryRequired" OR NEW."completedAt" IS NULL OR
    NEW."userId" IS NULL OR (TG_TABLE_NAME='VolunteerApplication' AND (new_json->>'recoveryRequired')::boolean) THEN
    invalidated := true;
  END IF;
  IF invalidated THEN
    IF OLD."serviceSharedAt" IS NOT NULL AND NEW."serviceVersion"<=OLD."serviceVersion" THEN legacy := true; END IF;
    NEW."serviceSharedAt" := NULL;
    NEW."serviceSharedCompletionVersion" := NULL;
    IF NEW."serviceRecoveryRequired" THEN NEW."completionNote" := ''; END IF;
  END IF;
  IF historical AND changed_source AND NEW."serviceVersion"<=OLD."serviceVersion" THEN legacy := true; END IF;
  IF legacy THEN
    NEW."serviceVersion" := greatest(NEW."serviceVersion",OLD."serviceVersion"+1);
    PERFORM volunteer_service_legacy_control(control_kind,OLD."userId",NEW.id,NEW."serviceVersion");
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER volunteer_service_signup_scrub BEFORE UPDATE ON "PostVolunteerSignup"
FOR EACH ROW EXECUTE FUNCTION volunteer_service_scrub();
CREATE TRIGGER volunteer_service_application_scrub BEFORE UPDATE ON "VolunteerApplication"
FOR EACH ROW EXECUTE FUNCTION volunteer_service_scrub();

CREATE INDEX "PostVolunteerSignup_service_profile" ON "PostVolunteerSignup"("userId",id)
WHERE "serviceSharedAt" IS NOT NULL;
CREATE INDEX "VolunteerApplication_service_profile" ON "VolunteerApplication"("userId",id)
WHERE "serviceSharedAt" IS NOT NULL;
