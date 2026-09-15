BEGIN;
ALTER TABLE "FeedbackSubmission" ADD COLUMN "contactInAppSince" TIMESTAMP(3), ADD COLUMN "contactEmailSince" TIMESTAMP(3), ADD COLUMN "contactPushSince" TIMESTAMP(3);
-- Older choices are dated conservatively; migration creates no events or deliveries.
UPDATE "FeedbackSubmission" SET "contactInAppSince"=CASE WHEN "contactInApp" THEN "updatedAt" END,
 "contactEmailSince"=CASE WHEN "contactEmail" THEN "updatedAt" END, "contactPushSince"=CASE WHEN "contactPush" THEN "updatedAt" END;
ALTER TABLE "FeedbackSubmission" ADD CONSTRAINT "FeedbackSubmission_contact_dates" CHECK (
 "contactInApp"=("contactInAppSince" IS NOT NULL) AND "contactEmail"=("contactEmailSince" IS NOT NULL) AND "contactPush"=("contactPushSince" IS NOT NULL));
ALTER TABLE "SocialPreferences" ADD COLUMN "feedbackEmailSince" TIMESTAMP(3);
ALTER TABLE "NotificationDelivery" ADD COLUMN channel TEXT NOT NULL DEFAULT 'PUSH', ADD COLUMN "emailCredentialVersion" INTEGER,
 ALTER COLUMN "subscriptionId" DROP NOT NULL, ALTER COLUMN "subscriptionVersion" DROP NOT NULL;
-- Retain the existing device uniqueness and add one durable email guard per event.
CREATE UNIQUE INDEX "NotificationDelivery_email_event_key" ON "NotificationDelivery"("eventId") WHERE channel='EMAIL';
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_channel_shape" CHECK (
 (channel='PUSH' AND "subscriptionId" IS NOT NULL AND "subscriptionVersion" IS NOT NULL AND "emailCredentialVersion" IS NULL)
 OR (channel='EMAIL' AND "subscriptionId" IS NULL AND "subscriptionVersion" IS NULL AND "emailCredentialVersion" IS NOT NULL AND "emailCredentialVersion">=1));
CREATE INDEX "FeedbackIdeaSubscription_fanout_idx" ON "FeedbackIdeaSubscription"("ideaId",id);
ALTER TABLE "NotificationFanoutJob" DROP CONSTRAINT "NotificationFanoutJob_shape_check";
ALTER TABLE "NotificationFanoutJob" ADD CONSTRAINT "NotificationFanoutJob_shape_check" CHECK (
 kind IN ('AUTHOR_POST','CHURCH_REVIEW','EVENT_CHANGED','VOLUNTEER_CHANGED','FEEDBACK_IDEA')
 AND phase IN ('PRIMARY','SECONDARY') AND "sourceVersion">0
 AND length("sourceId") BETWEEN 1 AND 100 AND length("actorId") BETWEEN 1 AND 100
 AND (cursor IS NULL OR length(cursor) BETWEEN 1 AND 100));
ALTER TABLE "SocialPreferences" DROP CONSTRAINT "SocialPreferences_notification_shape_check";
ALTER TABLE "SocialPreferences" ADD CONSTRAINT "SocialPreferences_notification_shape_check" CHECK (
  "notificationVersion" >= 0 AND cardinality("mutedNotificationCategories") <= 13
  AND "mutedNotificationCategories" <@ ARRAY['messages','requests','reports','founder','replies','mentions','conversations','prayer','posts','reactions','church','commitments','feedback']::TEXT[]
  AND ("notificationPushSince" IS NULL OR (jsonb_typeof("notificationPushSince")='object' AND octet_length("notificationPushSince"::text) <= 2048)));
ALTER TABLE "SocialEvent" DROP CONSTRAINT "SocialEvent_notification_source_check";
ALTER TABLE "SocialEvent" ADD CONSTRAINT "SocialEvent_notification_source_check" CHECK (
  ("sourceVersion" IS NULL OR "sourceVersion" > 0) AND ("sourceId" IS NULL OR length("sourceId") BETWEEN 1 AND 100)
  AND ("notificationCategory" IS NULL OR "notificationCategory" IN ('messages','requests','reports','founder','replies','mentions','conversations','prayer','posts','reactions','church','commitments','feedback')));
ALTER TABLE "SocialEvent" DROP CONSTRAINT "SocialEvent_source_shape";
ALTER TABLE "SocialEvent" ADD CONSTRAINT "SocialEvent_source_shape" CHECK (
 ("kind" NOT IN ('PUSH_TEST','REPORT_RECEIVED','REPORT_RECONSIDERATION','CONTENT_DECISION','AUTHOR_POST','POST_REACTION','COMMENT_REACTION','PRAYER_ACK','CHURCH_REVIEW','CHURCH_CONNECTION','CHURCH_ROLE','CHURCH_CAPABILITY','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CHANGED','VOLUNTEER_CONFIRMATION','FEEDBACK_CASE','FEEDBACK_IDEA') AND "kind" NOT LIKE 'ADULT_%' AND "postId" IS NOT NULL AND "commentId" IS NOT NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL)
 OR ("kind" = 'ADULT_REQUEST_CREATED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NOT NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'ADULT_REQUEST_ACCEPTED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NOT NULL AND "conversationId" IS NOT NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'ADULT_MESSAGE_CREATED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NOT NULL AND "messageId" IS NOT NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" IN ('REPORT_RECEIVED','REPORT_RECONSIDERATION') AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NOT NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'CONTENT_DECISION' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NOT NULL AND "decisionId" IS NOT NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'PUSH_TEST' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" = "actorId" AND "recipientId" IS NOT NULL)
 OR (kind IN ('AUTHOR_POST','POST_REACTION','COMMENT_REACTION','PRAYER_ACK','CHURCH_REVIEW','CHURCH_CONNECTION','CHURCH_ROLE','CHURCH_CAPABILITY','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CHANGED','VOLUNTEER_CONFIRMATION','FEEDBACK_CASE','FEEDBACK_IDEA') AND "recipientId" IS NOT NULL AND "sourceId" IS NOT NULL AND "sourceVersion" IS NOT NULL
   AND "notificationCategory" IS NOT NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL
   AND ((kind IN ('AUTHOR_POST','POST_REACTION') AND "postId" IS NOT NULL AND "commentId" IS NULL)
     OR (kind='COMMENT_REACTION' AND "postId" IS NOT NULL AND "commentId" IS NOT NULL)
     OR (kind='PRAYER_ACK' AND "postId" IS NOT NULL)
     OR (kind='VOLUNTEER_CHANGED' AND "postId" IS NOT NULL AND "commentId" IS NULL)
     OR (kind IN ('CHURCH_REVIEW','CHURCH_CONNECTION','CHURCH_ROLE','CHURCH_CAPABILITY','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CONFIRMATION','FEEDBACK_CASE','FEEDBACK_IDEA') AND "postId" IS NULL AND "commentId" IS NULL)))
);
ALTER TABLE "SocialPreferences" DROP CONSTRAINT notification_choices;
ALTER TABLE "SocialPreferences" ADD CONSTRAINT notification_choices CHECK (
  "pushCategories" <@ ARRAY['messages','requests','reports','founder','replies','mentions','conversations','prayer','posts','reactions','church','commitments','feedback']::text[] AND
  (("quietStart" IS NULL AND "quietEnd" IS NULL AND "quietTimeZone" IS NULL) OR
   ("quietStart" IS NOT NULL AND "quietEnd" IS NOT NULL AND "quietTimeZone" IS NOT NULL AND
    "quietStart" BETWEEN 0 AND 1439 AND "quietEnd" BETWEEN 0 AND 1439 AND
    "quietStart" <> "quietEnd" AND char_length("quietTimeZone") BETWEEN 1 AND 100))
);
COMMIT;
