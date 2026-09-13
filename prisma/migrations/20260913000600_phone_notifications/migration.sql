-- CreateEnum
CREATE TYPE "NotificationDeliveryState" AS ENUM ('QUEUED', 'IN_FLIGHT', 'FINISHED');

-- AlterTable
ALTER TABLE "SocialEvent" ADD COLUMN     "reportId" TEXT;

-- AlterTable
ALTER TABLE "SocialPreferences" ADD COLUMN     "founderAnnouncements" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pushCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "quietEnd" INTEGER,
ADD COLUMN     "quietStart" INTEGER,
ADD COLUMN     "quietTimeZone" TEXT,
ADD COLUMN     "reportAlerts" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sessionId" TEXT,
    "bindingHash" TEXT,
    "endpointHash" TEXT,
    "endpoint" TEXT,
    "p256dh" TEXT,
    "auth" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "subscriptionVersion" INTEGER NOT NULL,
    "state" "NotificationDeliveryState" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "statusCode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_bindingHash_key" ON "PushSubscription"("bindingHash");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpointHash_key" ON "PushSubscription"("endpointHash");

-- CreateIndex
CREATE INDEX "PushSubscription_ownerId_revokedAt_idx" ON "PushSubscription"("ownerId", "revokedAt");

-- CreateIndex
CREATE INDEX "PushSubscription_expiresAt_revokedAt_idx" ON "PushSubscription"("expiresAt", "revokedAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_state_availableAt_idx" ON "NotificationDelivery"("state", "availableAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_ownerId_createdAt_idx" ON "NotificationDelivery"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_finishedAt_idx" ON "NotificationDelivery"("finishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_eventId_subscriptionId_key" ON "NotificationDelivery"("eventId", "subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "PushDeliveryAttempt_deliveryId_attempt_key" ON "PushDeliveryAttempt"("deliveryId", "attempt");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PlatformSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SocialEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "PushSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDeliveryAttempt" ADD CONSTRAINT "PushDeliveryAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "NotificationDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SocialPreferences" ALTER COLUMN "pushCategories" SET NOT NULL;
ALTER TABLE "SocialPreferences" ADD CONSTRAINT notification_choices CHECK (
  "pushCategories" <@ ARRAY['messages','requests','reports','founder']::text[] AND
  (("quietStart" IS NULL AND "quietEnd" IS NULL AND "quietTimeZone" IS NULL) OR
   ("quietStart" IS NOT NULL AND "quietEnd" IS NOT NULL AND "quietTimeZone" IS NOT NULL AND
    "quietStart" BETWEEN 0 AND 1439 AND "quietEnd" BETWEEN 0 AND 1439 AND
    "quietStart" <> "quietEnd" AND char_length("quietTimeZone") BETWEEN 1 AND 100))
);
ALTER TABLE "PushSubscription" ADD CONSTRAINT push_subscription_shape CHECK (
  version > 0 AND char_length(label) BETWEEN 1 AND 80 AND
  (("revokedAt" IS NULL AND "sessionId" IS NOT NULL AND "bindingHash" IS NOT NULL AND
    "endpointHash" IS NOT NULL AND endpoint IS NOT NULL AND p256dh IS NOT NULL AND auth IS NOT NULL) OR
   ("revokedAt" IS NOT NULL AND "bindingHash" IS NULL AND "endpointHash" IS NULL AND
    endpoint IS NULL AND p256dh IS NULL AND auth IS NULL))
);
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT notification_delivery_shape CHECK (
  "subscriptionVersion" > 0 AND attempts >= 0 AND
  (outcome IS NULL OR outcome IN ('ACCEPTED','FAILED','CANCELLED')) AND
  ((state = 'FINISHED' AND "finishedAt" IS NOT NULL AND "leaseToken" IS NULL AND "leaseUntil" IS NULL) OR
   (state = 'IN_FLIGHT' AND "finishedAt" IS NULL AND "leaseToken" IS NOT NULL AND "leaseUntil" IS NOT NULL) OR
   (state = 'QUEUED' AND "finishedAt" IS NULL AND "leaseToken" IS NULL AND "leaseUntil" IS NULL))
);
ALTER TABLE "PushDeliveryAttempt" ADD CONSTRAINT push_attempt_shape CHECK (
  attempt > 0 AND outcome IN ('ATTEMPTED','ACCEPTED','RETRY','FAILED','EXPIRED') AND
  ("statusCode" IS NULL OR "statusCode" BETWEEN 100 AND 599)
);

CREATE FUNCTION guard_push_subscription() RETURNS trigger AS $$
BEGIN
  IF OLD."ownerId" <> NEW."ownerId" OR
    (OLD."sessionId" IS DISTINCT FROM NEW."sessionId" AND NEW."sessionId" IS NOT NULL) OR
    (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt") THEN
    RAISE EXCEPTION 'Device associations cannot be reassigned or reactivated';
  END IF;
  IF OLD."revokedAt" IS NULL AND NEW."revokedAt" IS NOT NULL THEN
    UPDATE "NotificationDelivery" SET state = 'FINISHED', outcome = 'CANCELLED',
      "finishedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), "leaseUntil" = NULL, "leaseToken" = NULL
      WHERE "subscriptionId" = OLD.id AND state <> 'FINISHED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER guard_push_subscription BEFORE UPDATE ON "PushSubscription"
FOR EACH ROW EXECUTE FUNCTION guard_push_subscription();

CREATE FUNCTION revoke_account_push() RETURNS trigger AS $$
BEGIN
  UPDATE "PushSubscription" SET "revokedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "bindingHash" = NULL, "endpointHash" = NULL, endpoint = NULL, p256dh = NULL, auth = NULL,
    label = 'Removed device',
    version = version + 1
  WHERE "revokedAt" IS NULL AND
    ((TG_TABLE_NAME = 'PlatformSession' AND "sessionId" = OLD.id) OR
     (TG_TABLE_NAME = 'PlatformUser' AND "ownerId" = OLD.id));
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER revoke_session_push BEFORE DELETE ON "PlatformSession"
FOR EACH ROW EXECUTE FUNCTION revoke_account_push();
CREATE TRIGGER revoke_account_push BEFORE UPDATE ON "PlatformUser"
FOR EACH ROW WHEN ((NEW."deactivatedAt" IS NOT NULL OR NEW."suspendedAt" IS NOT NULL OR
  NEW."emailVerifiedAt" IS NULL OR NEW."adultAcknowledgedAt" IS NULL) OR
  OLD."credentialVersion" <> NEW."credentialVersion") EXECUTE FUNCTION revoke_account_push();

CREATE FUNCTION guard_notification_delivery() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD."ownerId" <> NEW."ownerId" OR OLD."eventId" <> NEW."eventId" OR
    OLD."subscriptionId" <> NEW."subscriptionId" OR OLD."subscriptionVersion" <> NEW."subscriptionVersion" OR
    (OLD.state = 'FINISHED' AND NEW.state <> 'FINISHED')) THEN
    RAISE EXCEPTION 'Notification identity and terminal delivery are immutable';
  END IF;
  IF TG_OP = 'INSERT' AND NOT EXISTS (
    SELECT 1 FROM "PushSubscription" s JOIN "SocialEvent" e ON e.id = NEW."eventId"
    WHERE s.id = NEW."subscriptionId" AND s."ownerId" = NEW."ownerId" AND e."recipientId" = NEW."ownerId"
  ) THEN RAISE EXCEPTION 'Notification recipient does not own this device'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER guard_notification_delivery BEFORE INSERT OR UPDATE ON "NotificationDelivery"
FOR EACH ROW EXECUTE FUNCTION guard_notification_delivery();

ALTER TABLE "SocialEvent" DROP CONSTRAINT "SocialEvent_source_shape";
ALTER TABLE "SocialEvent" ADD CONSTRAINT "SocialEvent_source_shape" CHECK (
 ("kind" NOT IN ('PUSH_TEST','REPORT_RECEIVED') AND "kind" NOT LIKE 'ADULT_%' AND "postId" IS NOT NULL AND "commentId" IS NOT NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL)
 OR ("kind" = 'ADULT_REQUEST_CREATED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NOT NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'ADULT_REQUEST_ACCEPTED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NOT NULL AND "conversationId" IS NOT NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'ADULT_MESSAGE_CREATED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NOT NULL AND "messageId" IS NOT NULL AND "reportId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'REPORT_RECEIVED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NOT NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'PUSH_TEST' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "recipientId" = "actorId" AND "recipientId" IS NOT NULL));
CREATE UNIQUE INDEX "SocialEvent_one_report_recipient" ON "SocialEvent" ("reportId", "recipientId") WHERE "reportId" IS NOT NULL;

ALTER TABLE "NotificationDelivery" ADD COLUMN "dispatchedAt" TIMESTAMP(3);
