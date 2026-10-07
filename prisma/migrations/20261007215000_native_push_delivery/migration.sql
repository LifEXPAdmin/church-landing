BEGIN;

-- Existing browser associations and notification choices are preserved. Nothing
-- is registered, opted in, backfilled or sent by this migration.
CREATE TABLE "NativePushInstallation" (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  CONSTRAINT native_installation_shape CHECK (id ~ '^[a-f0-9]{64}$' AND version BETWEEN 1 AND 2147483647)
);
CREATE TABLE "NativePushRecovery" (
  id TEXT PRIMARY KEY CHECK (id='current'),
  epoch TEXT NOT NULL CHECK (epoch ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
);
INSERT INTO "NativePushRecovery"(id,epoch) VALUES ('current',gen_random_uuid()::text);
CREATE FUNCTION guard_native_installation_fence() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Retain native installation anti-replay state'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.version<>OLD.version+1 THEN
    RAISE EXCEPTION 'Native installation generations advance exactly once';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER guard_native_installation_fence BEFORE UPDATE OR DELETE ON "NativePushInstallation"
FOR EACH ROW EXECUTE FUNCTION guard_native_installation_fence();

ALTER TABLE "PushSubscription"
  ADD COLUMN provider TEXT NOT NULL DEFAULT 'WEB_PUSH',
  ADD COLUMN "nativeToken" TEXT,
  ADD COLUMN "nativePlatform" TEXT,
  ADD COLUMN "nativeProjectId" TEXT,
  ADD COLUMN "nativeRecoveryEpoch" TEXT,
  ADD COLUMN "installationHash" TEXT,
  ADD COLUMN "installationVersion" INTEGER;
CREATE UNIQUE INDEX "PushSubscription_installationHash_key" ON "PushSubscription"("installationHash");
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_installationHash_fkey"
FOREIGN KEY ("installationHash") REFERENCES "NativePushInstallation"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PushSubscription" DROP CONSTRAINT push_subscription_shape;
ALTER TABLE "PushSubscription" ADD CONSTRAINT push_subscription_shape CHECK (
  version > 0 AND char_length(label) BETWEEN 1 AND 80 AND provider IN ('WEB_PUSH','EXPO') AND
  (("revokedAt" IS NOT NULL AND "bindingHash" IS NULL AND "endpointHash" IS NULL AND
    endpoint IS NULL AND p256dh IS NULL AND auth IS NULL AND "nativeToken" IS NULL AND
    "nativePlatform" IS NULL AND "nativeProjectId" IS NULL AND "nativeRecoveryEpoch" IS NULL AND "installationHash" IS NULL AND "installationVersion" IS NULL) OR
   ("revokedAt" IS NULL AND "sessionId" IS NOT NULL AND "bindingHash" IS NOT NULL AND "endpointHash" IS NOT NULL AND
    ((provider='WEB_PUSH' AND endpoint IS NOT NULL AND p256dh IS NOT NULL AND auth IS NOT NULL AND
      "nativeToken" IS NULL AND "nativePlatform" IS NULL AND "nativeProjectId" IS NULL AND "nativeRecoveryEpoch" IS NULL AND "installationHash" IS NULL AND "installationVersion" IS NULL) OR
     (provider='EXPO' AND endpoint IS NULL AND p256dh IS NULL AND auth IS NULL AND
      "nativeToken" IS NOT NULL AND "nativeToken" ~ '^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-][A-Za-z0-9_-]{0,255}\]$' AND
      "nativePlatform" IS NOT NULL AND "nativePlatform" IN ('IOS','ANDROID') AND
      "nativeProjectId" IS NOT NULL AND "nativeProjectId" ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' AND
      "nativeRecoveryEpoch" IS NOT NULL AND "nativeRecoveryEpoch" ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' AND
      "installationHash" IS NOT NULL AND "installationHash" ~ '^[a-f0-9]{64}$' AND "bindingHash"="installationHash" AND
      "installationVersion" IS NOT NULL AND "installationVersion" BETWEEN 1 AND 2147483646))))
);

CREATE OR REPLACE FUNCTION guard_push_subscription() RETURNS trigger AS $$
BEGIN
  IF OLD."ownerId" IS DISTINCT FROM NEW."ownerId" OR OLD.provider IS DISTINCT FROM NEW.provider OR
    (OLD."sessionId" IS DISTINCT FROM NEW."sessionId" AND NEW."sessionId" IS NOT NULL) OR
    (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt") THEN
    RAISE EXCEPTION 'Device associations cannot be reassigned or reactivated';
  END IF;
  IF NEW."revokedAt" IS NULL AND (
    OLD."bindingHash" IS DISTINCT FROM NEW."bindingHash" OR OLD."endpointHash" IS DISTINCT FROM NEW."endpointHash" OR
    OLD.endpoint IS DISTINCT FROM NEW.endpoint OR OLD.p256dh IS DISTINCT FROM NEW.p256dh OR OLD.auth IS DISTINCT FROM NEW.auth OR
    OLD."nativeToken" IS DISTINCT FROM NEW."nativeToken" OR OLD."nativePlatform" IS DISTINCT FROM NEW."nativePlatform" OR
    OLD."nativeProjectId" IS DISTINCT FROM NEW."nativeProjectId" OR OLD."installationHash" IS DISTINCT FROM NEW."installationHash" OR
    OLD."nativeRecoveryEpoch" IS DISTINCT FROM NEW."nativeRecoveryEpoch" OR
    OLD."installationVersion" IS DISTINCT FROM NEW."installationVersion"
  ) THEN RAISE EXCEPTION 'Replace a device association to rotate routing credentials'; END IF;
  IF OLD."revokedAt" IS NULL AND NEW."revokedAt" IS NOT NULL THEN
    -- Registration locks session, subscription, then fence. Advancing the fence
    -- before replacement makes this conditional increment a no-op for old rows.
    IF OLD.provider='EXPO' THEN
      UPDATE "NativePushInstallation" SET version=version+1
        WHERE id=OLD."installationHash" AND version=OLD."installationVersion";
    END IF;
    UPDATE "NotificationDelivery" SET state='FINISHED',outcome='CANCELLED',
      "finishedAt"=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),"leaseUntil"=NULL,"leaseToken"=NULL
      WHERE "subscriptionId"=OLD.id AND state<>'FINISHED';
  END IF;
  -- Legacy logout, credential rotation, eligibility and erasure writers must
  -- scrub native credentials too. Preserve their existing account trigger.
  IF NEW."revokedAt" IS NOT NULL THEN
    NEW."bindingHash"=NULL; NEW."endpointHash"=NULL; NEW.endpoint=NULL; NEW.p256dh=NULL; NEW.auth=NULL;
    NEW."nativeToken"=NULL; NEW."nativePlatform"=NULL; NEW."nativeProjectId"=NULL;
    NEW."nativeRecoveryEpoch"=NULL;
    NEW."installationHash"=NULL; NEW."installationVersion"=NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION guard_native_push_registration() RETURNS trigger AS $$
BEGIN
  IF NEW.provider='EXPO' AND NEW."revokedAt" IS NULL AND NOT EXISTS (
    SELECT 1 FROM "NativePushInstallation" f JOIN "PlatformSession" s ON s.id=NEW."sessionId"
      JOIN "NativePushRecovery" r ON r.id='current' AND r.epoch=NEW."nativeRecoveryEpoch"
      WHERE f.id=NEW."installationHash" AND f.version=NEW."installationVersion" AND s."userId"=NEW."ownerId"
  ) THEN RAISE EXCEPTION 'Native devices require a current installation generation and owned session'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER guard_native_push_registration BEFORE INSERT ON "PushSubscription"
FOR EACH ROW EXECUTE FUNCTION guard_native_push_registration();
CREATE FUNCTION guard_native_push_delete() RETURNS trigger AS $$
BEGIN
  IF OLD.provider='EXPO' AND OLD."revokedAt" IS NULL THEN
    RAISE EXCEPTION 'Revoke native device associations before deleting them';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER guard_native_push_delete BEFORE DELETE ON "PushSubscription"
FOR EACH ROW EXECUTE FUNCTION guard_native_push_delete();

ALTER TABLE "NotificationDelivery"
  ADD COLUMN "nativeTicketId" TEXT,
  ADD COLUMN "nativeTicketCreatedAt" TIMESTAMP(3),
  ADD COLUMN "nativeReceiptChecks" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT native_ticket_shape CHECK (
  "nativeReceiptChecks" BETWEEN 0 AND 100 AND
  (("nativeTicketId" IS NULL AND "nativeTicketCreatedAt" IS NULL AND "nativeReceiptChecks"=0) OR
   (channel='PUSH' AND state<>'FINISHED' AND attempts>0 AND "nativeTicketId" IS NOT NULL AND
    "nativeTicketId" ~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' AND "nativeTicketCreatedAt" IS NOT NULL))
);
CREATE FUNCTION guard_native_push_ticket() RETURNS trigger AS $$
BEGIN
  -- All old cancellation writers retire tickets without needing native fields.
  IF NEW.state='FINISHED' THEN
    NEW."nativeTicketId"=NULL; NEW."nativeTicketCreatedAt"=NULL; NEW."nativeReceiptChecks"=0;
  ELSIF NEW."nativeTicketId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "PushSubscription" s WHERE s.id=NEW."subscriptionId" AND s.provider='EXPO'
      AND s.version=NEW."subscriptionVersion" AND s."revokedAt" IS NULL
  ) THEN RAISE EXCEPTION 'Provider tickets belong to their active native device version'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER guard_native_push_ticket BEFORE INSERT OR UPDATE ON "NotificationDelivery"
FOR EACH ROW EXECUTE FUNCTION guard_native_push_ticket();

COMMIT;
