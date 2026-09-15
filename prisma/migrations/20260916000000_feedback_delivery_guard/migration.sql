BEGIN;
CREATE OR REPLACE FUNCTION guard_notification_delivery() RETURNS trigger AS $$
BEGIN
  IF TG_OP='UPDATE' AND (
    OLD."ownerId" IS DISTINCT FROM NEW."ownerId" OR OLD."eventId" IS DISTINCT FROM NEW."eventId" OR
    OLD.channel IS DISTINCT FROM NEW.channel OR OLD."subscriptionId" IS DISTINCT FROM NEW."subscriptionId" OR
    OLD."subscriptionVersion" IS DISTINCT FROM NEW."subscriptionVersion" OR
    OLD."emailCredentialVersion" IS DISTINCT FROM NEW."emailCredentialVersion" OR
    (OLD.state='FINISHED' AND NEW.state<>'FINISHED')
  ) THEN RAISE EXCEPTION 'Notification identity and terminal delivery are immutable'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.channel='PUSH' AND NOT EXISTS (
      SELECT 1 FROM "PushSubscription" s JOIN "SocialEvent" e ON e.id=NEW."eventId"
      WHERE s.id=NEW."subscriptionId" AND s."ownerId"=NEW."ownerId" AND e."recipientId"=NEW."ownerId"
    ) THEN RAISE EXCEPTION 'Notification recipient does not own this device'; END IF;
    IF NEW.channel='EMAIL' AND NOT EXISTS (
      SELECT 1 FROM "SocialEvent" e JOIN "PlatformUser" u ON u.id=e."recipientId"
      WHERE e.id=NEW."eventId" AND e."recipientId"=NEW."ownerId" AND e.kind IN ('FEEDBACK_CASE','FEEDBACK_IDEA')
        AND u."credentialVersion"=NEW."emailCredentialVersion" AND u."emailVerifiedAt" IS NOT NULL
    ) THEN RAISE EXCEPTION 'Feedback email requires the current recipient credentials'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION revoke_account_push() RETURNS trigger AS $$
BEGIN
  UPDATE "PushSubscription" SET "revokedAt"=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "bindingHash"=NULL,"endpointHash"=NULL,endpoint=NULL,p256dh=NULL,auth=NULL,
    label='Removed device',version=version+1
  WHERE "revokedAt" IS NULL AND
    ((TG_TABLE_NAME='PlatformSession' AND "sessionId"=OLD.id) OR
     (TG_TABLE_NAME='PlatformUser' AND "ownerId"=OLD.id));
  -- Email belongs to the account rather than one browser session. The existing
  -- account trigger covers credential changes and loss of account eligibility.
  IF TG_TABLE_NAME='PlatformUser' THEN
    UPDATE "NotificationDelivery" SET state='FINISHED',outcome='CANCELLED',
      "finishedAt"=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),"leaseUntil"=NULL,"leaseToken"=NULL
    WHERE "ownerId"=OLD.id AND channel='EMAIL' AND state<>'FINISHED';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
COMMIT;
