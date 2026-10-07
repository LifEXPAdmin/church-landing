-- References stay in the existing private agreement owner. These indexes bound
-- canonical event/slot invalidation without adding another participation pool.
CREATE INDEX "InterchurchHelpAgreement_schedule_occurrence"
ON "InterchurchHelpAgreement" ((terms->'schedule'->>'occurrenceId'))
WHERE terms ? 'schedule' AND state IN ('NEEDS_REVIEW','CONFIRMED');
CREATE INDEX "InterchurchHelpAgreement_schedule_slot"
ON "InterchurchHelpAgreement" ((terms->'schedule'->>'id'))
WHERE terms ? 'schedule' AND terms->'schedule'->>'kind'='VOLUNTEER_SLOT'
AND state IN ('NEEDS_REVIEW','CONFIRMED');
CREATE INDEX "CalendarAudit_event_publication_epoch"
ON "CalendarAudit" ("targetId", version DESC, id DESC)
WHERE action='SET_EVENT_VISIBILITY';

CREATE FUNCTION interchurch_schedule_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  schedule jsonb;
  protected boolean;
  scrub boolean := false;
  safety_cancel boolean := false;
BEGIN
  IF TG_OP='DELETE' THEN
    -- There is no current agreement deletion owner. Preserve already scrubbed
    -- terminal cleanup while refusing deletion of live linked commitments.
    IF OLD.terms ? 'schedule' AND current_setting('gc.interchurch_schedule_writer',true) IS DISTINCT FROM 'v1' THEN
      IF OLD.state NOT IN ('REVOKED','CANCELED','COMPLETED') OR OLD."authorityKey" IS NOT NULL
        OR OLD."requesterAcknowledged" IS NOT NULL OR OLD."responderAcknowledged" IS NOT NULL
        OR OLD."requesterContact"<>'' OR OLD."responderContact"<>''
        OR NOT EXISTS (SELECT 1 FROM "InterchurchHelpOffer" o WHERE o.id=OLD."offerId"
          AND o."responderId" IS NULL AND o."coordinatorId" IS NULL)
      THEN RAISE EXCEPTION 'Current ministry schedule writer required'; END IF;
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.terms ? 'schedule' THEN
    schedule := NEW.terms->'schedule';
    IF jsonb_typeof(schedule) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid ministry schedule binding';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(schedule))<>5
      OR NOT (schedule ?& ARRAY['schema','kind','id','occurrenceId','fingerprint'])
      OR schedule->'schema' IS DISTINCT FROM '1'::jsonb
      OR jsonb_typeof(schedule->'kind') IS DISTINCT FROM 'string'
      OR schedule->>'kind' NOT IN ('EVENT','VOLUNTEER_SLOT')
      OR jsonb_typeof(schedule->'id') IS DISTINCT FROM 'string'
      OR schedule->>'id' !~ '^[A-Za-z0-9_-]{1,100}$'
      OR jsonb_typeof(schedule->'occurrenceId') IS DISTINCT FROM 'string'
      OR schedule->>'occurrenceId' !~ '^[A-Za-z0-9_-]{1,100}$'
      OR jsonb_typeof(schedule->'fingerprint') IS DISTINCT FROM 'string'
      OR schedule->>'fingerprint' !~ '^[a-f0-9]{64}$'
      OR (schedule->>'kind'='EVENT' AND schedule->>'id'<>schedule->>'occurrenceId')
    THEN RAISE EXCEPTION 'Invalid ministry schedule binding'; END IF;
  END IF;
  protected := NEW.terms ? 'schedule';
  IF TG_OP='UPDATE' THEN protected := protected OR OLD.terms ? 'schedule'; END IF;
  IF NOT protected OR current_setting('gc.interchurch_schedule_writer',true)='v1' THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN RAISE EXCEPTION 'Current ministry schedule writer required'; END IF;

  -- Recovery applies state=REVOKED and clears consent in two separate writes.
  -- Permit only monotonic restriction by older cleanup owners. No new or changed
  -- consent, active revival, completion, source replacement or link dropping.
  scrub := NEW.terms='{}'::jsonb AND NEW.state IN ('REVOKED','CANCELED','COMPLETED')
    AND NEW."authorityKey" IS NULL AND NEW."requesterAcknowledged" IS NULL
    AND NEW."responderAcknowledged" IS NULL AND NEW."requesterContact"=''
    AND NEW."responderContact"='' AND NEW."requesterNoticeSince" IS NULL
    AND NEW."responderNoticeSince" IS NULL
    AND EXISTS (SELECT 1 FROM "InterchurchHelpOffer" o WHERE o.id=NEW."offerId"
      AND o."responderId" IS NULL AND o."coordinatorId" IS NULL);
  -- Older safety owners can record the first cancellation and its reason only
  -- while clearing both contacts. Historical acknowledgments/notices may remain
  -- unchanged on this terminal record, but cannot be added or replaced below.
  -- All authority, terms and unrelated-field restrictions still apply.
  safety_cancel := OLD.state IN ('NEEDS_REVIEW','CONFIRMED') AND NEW.state='CANCELED'
    AND OLD."canceledAt" IS NULL AND NEW."canceledAt" IS NOT NULL
    AND OLD."completionNote"='' AND length(btrim(NEW."completionNote")) BETWEEN 3 AND 1000
    AND NEW."requesterContact"='' AND NEW."responderContact"='';
  IF NEW.version<OLD.version OR NEW."termsVersion"<OLD."termsVersion"
    OR NEW."contactVersion"<OLD."contactVersion"
    OR (NEW.terms IS DISTINCT FROM OLD.terms AND NOT scrub)
    OR (NEW."completionNote" IS DISTINCT FROM OLD."completionNote" AND NOT (scrub AND NEW."completionNote"='') AND NOT safety_cancel)
    OR (NEW."canceledAt" IS DISTINCT FROM OLD."canceledAt" AND NOT safety_cancel)
    OR (NEW."authorityKey" IS NOT NULL AND NEW."authorityKey" IS DISTINCT FROM OLD."authorityKey")
    OR (NEW."requesterAcknowledged" IS NOT NULL AND NEW."requesterAcknowledged" IS DISTINCT FROM OLD."requesterAcknowledged")
    OR (NEW."responderAcknowledged" IS NOT NULL AND NEW."responderAcknowledged" IS DISTINCT FROM OLD."responderAcknowledged")
    OR (NEW."requesterContact"<>'' AND NEW."requesterContact" IS DISTINCT FROM OLD."requesterContact")
    OR (NEW."responderContact"<>'' AND NEW."responderContact" IS DISTINCT FROM OLD."responderContact")
    OR (NEW."requesterNoticeSince" IS NOT NULL AND NEW."requesterNoticeSince" IS DISTINCT FROM OLD."requesterNoticeSince")
    OR (NEW."responderNoticeSince" IS NOT NULL AND NEW."responderNoticeSince" IS DISTINCT FROM OLD."responderNoticeSince")
    OR (NEW.state<>OLD.state AND NOT (OLD.state IN ('NEEDS_REVIEW','CONFIRMED') AND NEW.state IN ('NEEDS_REVIEW','REVOKED','CANCELED')))
    OR (to_jsonb(NEW)-ARRAY['updatedAt','version','termsVersion','contactVersion','terms','completionNote','canceledAt','authorityKey',
      'requesterAcknowledged','responderAcknowledged','requesterContact','responderContact','requesterNoticeSince','responderNoticeSince','state'])
      IS DISTINCT FROM
      (to_jsonb(OLD)-ARRAY['updatedAt','version','termsVersion','contactVersion','terms','completionNote','canceledAt','authorityKey',
      'requesterAcknowledged','responderAcknowledged','requesterContact','responderContact','requesterNoticeSince','responderNoticeSince','state'])
  THEN RAISE EXCEPTION 'Current ministry schedule writer required'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "InterchurchHelpAgreement_schedule_binding"
BEFORE INSERT OR UPDATE OR DELETE ON "InterchurchHelpAgreement"
FOR EACH ROW EXECUTE FUNCTION interchurch_schedule_binding();
