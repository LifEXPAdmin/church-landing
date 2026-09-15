BEGIN;
ALTER TABLE "PlatformPost"
  ADD COLUMN "scheduleDispatchedAt" TIMESTAMP(3),
  ADD COLUMN "scheduleDispatchedVersion" INTEGER,
  ADD CONSTRAINT "PlatformPost_schedule_dispatch_shape" CHECK (
    ("scheduleDispatchedAt" IS NULL AND "scheduleDispatchedVersion" IS NULL) OR
    ("scheduleDispatchedAt" IS NOT NULL AND "scheduleDispatchedVersion" > 0)
  );
ALTER TABLE "SocialRelationship"
  ADD COLUMN "authorBellSince" TIMESTAMP(3),
  ADD COLUMN "authorBellVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SocialRelationship" ADD CONSTRAINT "SocialRelationship_bell_version_check" CHECK ("authorBellVersion" >= 0 AND (NOT blocked OR "authorBellSince" IS NULL));
-- Match the continuation's id keyset; opted-out rows never enter these indexes.
CREATE INDEX "SocialRelationship_person_bell_page_idx" ON "SocialRelationship"("targetUserId", id) INCLUDE ("ownerId", "authorBellSince", blocked) WHERE "authorBellSince" IS NOT NULL;
CREATE INDEX "SocialRelationship_church_bell_page_idx" ON "SocialRelationship"("churchId", id) INCLUDE ("ownerId", "authorBellSince", blocked) WHERE "authorBellSince" IS NOT NULL;
ALTER TABLE "SocialPreferences"
  ADD COLUMN "notificationVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "notificationRecoveryRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mutedNotificationCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "notificationPushSince" JSONB;
ALTER TABLE "SocialPreferences" ADD CONSTRAINT "SocialPreferences_notification_shape_check" CHECK (
  "notificationVersion" >= 0 AND cardinality("mutedNotificationCategories") <= 12
  AND "mutedNotificationCategories" <@ ARRAY['messages','requests','reports','founder','replies','mentions','conversations','prayer','posts','reactions','church','commitments']::TEXT[]
  AND ("notificationPushSince" IS NULL OR (jsonb_typeof("notificationPushSince")='object' AND octet_length("notificationPushSince"::text) <= 2048)));
ALTER TABLE "SocialEvent"
  ADD COLUMN "notificationCategory" TEXT,
  ADD COLUMN "sourceId" TEXT,
  ADD COLUMN "sourceVersion" INTEGER;
ALTER TABLE "SocialEvent" ADD CONSTRAINT "SocialEvent_notification_source_check" CHECK (
  ("sourceVersion" IS NULL OR "sourceVersion" > 0) AND ("sourceId" IS NULL OR length("sourceId") BETWEEN 1 AND 100)
  AND ("notificationCategory" IS NULL OR "notificationCategory" IN ('messages','requests','reports','founder','replies','mentions','conversations','prayer','posts','reactions','church','commitments')));
CREATE TABLE "NotificationFanoutJob" (
  id TEXT NOT NULL PRIMARY KEY, key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL, "sourceId" TEXT NOT NULL, "sourceVersion" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL, phase TEXT NOT NULL DEFAULT 'PRIMARY', cursor TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3), "dispatchedAt" TIMESTAMP(3),
  CONSTRAINT "NotificationFanoutJob_shape_check" CHECK (
    kind IN ('AUTHOR_POST','CHURCH_REVIEW','EVENT_CHANGED','VOLUNTEER_CHANGED')
    AND phase IN ('PRIMARY','SECONDARY') AND "sourceVersion" > 0
    AND length("sourceId") BETWEEN 1 AND 100 AND length("actorId") BETWEEN 1 AND 100
    AND (cursor IS NULL OR length(cursor) BETWEEN 1 AND 100))
);
CREATE INDEX "NotificationFanoutJob_completedAt_dispatchedAt_createdAt_idx" ON "NotificationFanoutJob"("completedAt", "dispatchedAt", "createdAt");
CREATE INDEX "NotificationFanoutJob_actorId_idx" ON "NotificationFanoutJob"("actorId");
CREATE INDEX "NotificationFanoutJob_sourceId_idx" ON "NotificationFanoutJob"("sourceId");
ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_kind_check";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_kind_check" CHECK (
  kind IN ('REPORT','HOLD','MODERATION_POST','MODERATION_COMMENT','MODERATION_TOPIC','APPEAL',
    'ACCOUNT_STATE','AUTHOR_WITHDRAW_POST','AUTHOR_WITHDRAW_COMMENT','TOPIC_ACCESS','POST_DISCOVERY','DISCOVERY_PREFERENCES','NOTIFICATION_PREFERENCES','AUTHOR_BELL'));
ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_account_scope";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_account_scope" CHECK (
  (kind='ACCOUNT_STATE' AND target::text='ACCOUNT' AND "sourceId"="targetId")
  OR (kind IN ('TOPIC_ACCESS','POST_DISCOVERY','DISCOVERY_PREFERENCES','NOTIFICATION_PREFERENCES','AUTHOR_BELL') AND target::text='ACCOUNT')
  OR (kind NOT IN ('ACCOUNT_STATE','TOPIC_ACCESS','POST_DISCOVERY','DISCOVERY_PREFERENCES','NOTIFICATION_PREFERENCES','AUTHOR_BELL') AND target::text<>'ACCOUNT'));

-- Classify existing recipient intents without changing any original field or
-- creating history/delivery. Current access remains required by every reader.
UPDATE "SocialEvent" e SET "notificationCategory" = CASE
  WHEN EXISTS (SELECT 1 FROM "CommentMention" m WHERE m."commentId"=c.id AND m."recipientId"=e."recipientId" AND m.active) THEN 'mentions'
  WHEN (p."authorChurchId" IS NULL AND p."authorId"=e."recipientId") OR
       (parent."authorChurchId" IS NULL AND parent."authorId"=e."recipientId" AND parent."deletedAt" IS NULL) THEN 'replies'
  WHEN EXISTS (SELECT 1 FROM "PrayerUpdate" u WHERE u."commentId"=c.id) THEN 'prayer'
  ELSE 'conversations' END
FROM "PlatformPostComment" c JOIN "PlatformPost" p ON p.id=c."postId"
LEFT JOIN "PlatformPostComment" parent ON parent.id=c."parentId"
WHERE e.kind='COMMENT_ACTIVITY' AND e."commentId"=c.id AND e."postId"=p.id AND e."actorId"=c."authorId";

ALTER TABLE "SocialPreferences" DROP CONSTRAINT notification_choices;
ALTER TABLE "SocialPreferences" ADD CONSTRAINT notification_choices CHECK (
  "pushCategories" <@ ARRAY['messages','requests','reports','founder','replies','mentions','conversations','prayer','posts','reactions','church','commitments']::text[] AND
  (("quietStart" IS NULL AND "quietEnd" IS NULL AND "quietTimeZone" IS NULL) OR
   ("quietStart" IS NOT NULL AND "quietEnd" IS NOT NULL AND "quietTimeZone" IS NOT NULL AND
    "quietStart" BETWEEN 0 AND 1439 AND "quietEnd" BETWEEN 0 AND 1439 AND
    "quietStart" <> "quietEnd" AND char_length("quietTimeZone") BETWEEN 1 AND 100))
);

ALTER TABLE "SocialEvent" DROP CONSTRAINT "SocialEvent_source_shape";
ALTER TABLE "SocialEvent" ADD CONSTRAINT "SocialEvent_source_shape" CHECK (
 ("kind" NOT IN ('PUSH_TEST','REPORT_RECEIVED','REPORT_RECONSIDERATION','CONTENT_DECISION','AUTHOR_POST','POST_REACTION','COMMENT_REACTION','PRAYER_ACK','CHURCH_REVIEW','CHURCH_CONNECTION','CHURCH_ROLE','CHURCH_CAPABILITY','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CHANGED','VOLUNTEER_CONFIRMATION') AND "kind" NOT LIKE 'ADULT_%' AND "postId" IS NOT NULL AND "commentId" IS NOT NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL)
 OR ("kind" = 'ADULT_REQUEST_CREATED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NOT NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'ADULT_REQUEST_ACCEPTED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NOT NULL AND "conversationId" IS NOT NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'ADULT_MESSAGE_CREATED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NOT NULL AND "messageId" IS NOT NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" IN ('REPORT_RECEIVED','REPORT_RECONSIDERATION') AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NOT NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'CONTENT_DECISION' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NOT NULL AND "decisionId" IS NOT NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'PUSH_TEST' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" = "actorId" AND "recipientId" IS NOT NULL)
 OR (kind IN ('AUTHOR_POST','POST_REACTION','COMMENT_REACTION','PRAYER_ACK','CHURCH_REVIEW','CHURCH_CONNECTION','CHURCH_ROLE','CHURCH_CAPABILITY','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CHANGED','VOLUNTEER_CONFIRMATION') AND "recipientId" IS NOT NULL AND "sourceId" IS NOT NULL AND "sourceVersion" IS NOT NULL
   AND "notificationCategory" IS NOT NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL
   AND ((kind IN ('AUTHOR_POST','POST_REACTION') AND "postId" IS NOT NULL AND "commentId" IS NULL)
     OR (kind='COMMENT_REACTION' AND "postId" IS NOT NULL AND "commentId" IS NOT NULL)
     OR (kind='PRAYER_ACK' AND "postId" IS NOT NULL)
     OR (kind='VOLUNTEER_CHANGED' AND "postId" IS NOT NULL AND "commentId" IS NULL)
     OR (kind IN ('CHURCH_REVIEW','CHURCH_CONNECTION','CHURCH_ROLE','CHURCH_CAPABILITY','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CONFIRMATION') AND "postId" IS NULL AND "commentId" IS NULL)))
);
COMMIT;
