BEGIN;
-- Native account credential versions start at zero. Email binds that exact
-- current value; it does not assign a new version or alter an account.
ALTER TABLE "NotificationDelivery" DROP CONSTRAINT "NotificationDelivery_channel_shape";
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_channel_shape" CHECK (
 (channel='PUSH' AND "subscriptionId" IS NOT NULL AND "subscriptionVersion" IS NOT NULL AND "emailCredentialVersion" IS NULL)
 OR (channel='EMAIL' AND "subscriptionId" IS NULL AND "subscriptionVersion" IS NULL AND "emailCredentialVersion" IS NOT NULL AND "emailCredentialVersion">=0));
COMMIT;
