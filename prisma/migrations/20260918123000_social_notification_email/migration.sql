BEGIN;
-- No historical opt-ins or delivery backfill.
ALTER TABLE "SocialPreferences" ADD COLUMN "notificationEmailSince" JSONB;
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
      WHERE e.id=NEW."eventId" AND e."recipientId"=NEW."ownerId" AND (
          e.kind IN ('FEEDBACK_CASE','FEEDBACK_IDEA') OR
          (e.kind='COMMENT_ACTIVITY' AND e."notificationCategory"='replies') OR
          (e.kind IN ('POST_REACTION','COMMENT_REACTION') AND e."notificationCategory"='reactions')
        )
        AND u."credentialVersion"=NEW."emailCredentialVersion" AND u."emailVerifiedAt" IS NOT NULL
    ) THEN RAISE EXCEPTION 'Optional email requires a supported source and current recipient credentials'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
