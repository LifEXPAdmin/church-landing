BEGIN;
-- CreateTable
CREATE TABLE "ExchangeFavorite" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "listingId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeSavedSearch" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schema" INTEGER NOT NULL DEFAULT 1,
    "criteria" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "alertsSince" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "recoveryRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeSavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeSearchMatch" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "searchVersion" INTEGER NOT NULL,
    "listingVersion" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeSearchMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeFavorite_ownerId_deletedAt_id_idx" ON "ExchangeFavorite"("ownerId", "deletedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeFavorite_ownerId_listingId_key" ON "ExchangeFavorite"("ownerId", "listingId");

-- CreateIndex
CREATE INDEX "ExchangeSavedSearch_ownerId_deletedAt_id_idx" ON "ExchangeSavedSearch"("ownerId", "deletedAt", "id");

-- CreateIndex
CREATE INDEX "ExchangeSavedSearch_alertsSince_id_idx" ON "ExchangeSavedSearch"("alertsSince", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeSavedSearch_ownerId_id_key" ON "ExchangeSavedSearch"("ownerId", "id");

-- CreateIndex
CREATE INDEX "ExchangeSearchMatch_ownerId_searchId_idx" ON "ExchangeSearchMatch"("ownerId", "searchId");

-- CreateIndex
CREATE INDEX "ExchangeSearchMatch_listingId_idx" ON "ExchangeSearchMatch"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeSearchMatch_ownerId_listingId_key" ON "ExchangeSearchMatch"("ownerId", "listingId");

-- AddForeignKey
ALTER TABLE "ExchangeFavorite" ADD CONSTRAINT "ExchangeFavorite_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeFavorite" ADD CONSTRAINT "ExchangeFavorite_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ExchangeListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeSavedSearch" ADD CONSTRAINT "ExchangeSavedSearch_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeSearchMatch" ADD CONSTRAINT "ExchangeSearchMatch_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeSearchMatch" ADD CONSTRAINT "ExchangeSearchMatch_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ExchangeListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeSearchMatch" ADD CONSTRAINT "ExchangeSearchMatch_ownerId_searchId_fkey" FOREIGN KEY ("ownerId", "searchId") REFERENCES "ExchangeSavedSearch"("ownerId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrictive stored-choice invariants also apply to maintenance and restoration.
ALTER TABLE "ExchangeFavorite" ADD CONSTRAINT "ExchangeFavorite_shape" CHECK (
  version > 0 AND id ~ '^[a-f0-9]{64}$'
);
ALTER TABLE "ExchangeSavedSearch" ADD CONSTRAINT "ExchangeSavedSearch_shape" CHECK (
  version > 0 AND schema = 1 AND length(name) <= 80
  AND jsonb_typeof(criteria) = 'object' AND octet_length(criteria::text) <= 4000
  AND ("deletedAt" IS NOT NULL OR "recoveryRequired" OR length(trim(name)) > 0)
  AND (("deletedAt" IS NULL AND NOT "recoveryRequired") OR "alertsSince" IS NULL)
);
ALTER TABLE "ExchangeSearchMatch" ADD CONSTRAINT "ExchangeSearchMatch_shape" CHECK (
  "searchVersion" > 0 AND "listingVersion" > 0
);

ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_kind_check";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_kind_check" CHECK (
 kind IN ('REPORT','HOLD','MODERATION_POST','MODERATION_COMMENT','MODERATION_TOPIC','MODERATION_EXCHANGE',
 'TOPIC_ACCESS','POST_DISCOVERY','EXCHANGE_VISIBILITY','EXCHANGE_FAVORITE','EXCHANGE_SAVED_SEARCH','DISCOVERY_PREFERENCES','NOTIFICATION_PREFERENCES',
 'AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','APPEAL','ACCOUNT_STATE',
 'AUTHOR_WITHDRAW_POST','AUTHOR_WITHDRAW_COMMENT','SUPPORT_MESSAGE','SUPPORT_ATTACHMENT','FEEDBACK_PROMPT',
 'FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION','FEEDBACK_REVIEW','PHOTO_TAG','PHOTO_TAG_PREFERENCES','PROFILE_LOCATION'));
ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_account_scope";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_account_scope" CHECK (
 (kind IN ('ACCOUNT_STATE','FEEDBACK_PROMPT') AND target::text='ACCOUNT' AND "sourceId"="targetId")
 OR (kind IN ('TOPIC_ACCESS','POST_DISCOVERY','EXCHANGE_VISIBILITY','EXCHANGE_FAVORITE','EXCHANGE_SAVED_SEARCH','DISCOVERY_PREFERENCES','NOTIFICATION_PREFERENCES','AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION','FEEDBACK_REVIEW','PHOTO_TAG','PHOTO_TAG_PREFERENCES','PROFILE_LOCATION') AND target::text='ACCOUNT')
 OR (kind NOT IN ('ACCOUNT_STATE','FEEDBACK_PROMPT','TOPIC_ACCESS','POST_DISCOVERY','EXCHANGE_VISIBILITY','EXCHANGE_FAVORITE','EXCHANGE_SAVED_SEARCH','DISCOVERY_PREFERENCES','NOTIFICATION_PREFERENCES','AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION','FEEDBACK_REVIEW','PHOTO_TAG','PHOTO_TAG_PREFERENCES','PROFILE_LOCATION') AND target::text<>'ACCOUNT'));

ALTER TABLE "SocialPreferences" DROP CONSTRAINT "SocialPreferences_notification_shape_check";
ALTER TABLE "SocialPreferences" ADD CONSTRAINT "SocialPreferences_notification_shape_check" CHECK (
  "notificationVersion" >= 0 AND cardinality("mutedNotificationCategories") <= 15
  AND "mutedNotificationCategories" <@ ARRAY['messages','requests','reports','founder','replies','mentions','conversations','prayer','posts','reactions','church','commitments','feedback','photos','exchange']::TEXT[]
  AND ("notificationPushSince" IS NULL OR (jsonb_typeof("notificationPushSince")='object' AND octet_length("notificationPushSince"::text) <= 2048)));
ALTER TABLE "SocialEvent" DROP CONSTRAINT "SocialEvent_notification_source_check";
ALTER TABLE "SocialEvent" ADD CONSTRAINT "SocialEvent_notification_source_check" CHECK (
  ("sourceVersion" IS NULL OR "sourceVersion" > 0) AND ("sourceId" IS NULL OR length("sourceId") BETWEEN 1 AND 100)
  AND ("notificationCategory" IS NULL OR "notificationCategory" IN ('messages','requests','reports','founder','replies','mentions','conversations','prayer','posts','reactions','church','commitments','feedback','photos','exchange')));
ALTER TABLE "SocialPreferences" DROP CONSTRAINT notification_choices;
ALTER TABLE "SocialPreferences" ADD CONSTRAINT notification_choices CHECK (
  "pushCategories" <@ ARRAY['messages','requests','reports','founder','replies','mentions','conversations','prayer','posts','reactions','church','commitments','feedback','photos','exchange']::text[] AND
  (("quietStart" IS NULL AND "quietEnd" IS NULL AND "quietTimeZone" IS NULL) OR
   ("quietStart" IS NOT NULL AND "quietEnd" IS NOT NULL AND "quietTimeZone" IS NOT NULL AND
    "quietStart" BETWEEN 0 AND 1439 AND "quietEnd" BETWEEN 0 AND 1439 AND
    "quietStart" <> "quietEnd" AND char_length("quietTimeZone") BETWEEN 1 AND 100))
);


ALTER TABLE "SocialEvent" DROP CONSTRAINT "SocialEvent_source_shape";
ALTER TABLE "SocialEvent" ADD CONSTRAINT "SocialEvent_source_shape" CHECK (
 ("kind" NOT IN ('PUSH_TEST','REPORT_RECEIVED','REPORT_RECONSIDERATION','CONTENT_DECISION','AUTHOR_POST','POST_MENTION','POST_REACTION','COMMENT_REACTION','PRAYER_ACK','CHURCH_REVIEW','CHURCH_CONNECTION','CHURCH_ROLE','CHURCH_CAPABILITY','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CHANGED','VOLUNTEER_REQUEST','VOLUNTEER_CONFIRMATION','FEEDBACK_CASE','FEEDBACK_IDEA','PHOTO_TAG_REQUEST','PHOTO_TAG_APPROVED','FRIEND_CONNECTED','EXCHANGE_MATCH') AND "kind" NOT LIKE 'ADULT_%' AND "postId" IS NOT NULL AND "commentId" IS NOT NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL)
 OR ("kind" = 'ADULT_REQUEST_CREATED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NOT NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'ADULT_REQUEST_ACCEPTED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NOT NULL AND "conversationId" IS NOT NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'ADULT_MESSAGE_CREATED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NOT NULL AND "messageId" IS NOT NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" IN ('REPORT_RECEIVED','REPORT_RECONSIDERATION') AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NOT NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'CONTENT_DECISION' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NOT NULL AND "decisionId" IS NOT NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'PUSH_TEST' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" = "actorId" AND "recipientId" IS NOT NULL)
 OR (kind IN ('AUTHOR_POST','POST_MENTION','POST_REACTION','COMMENT_REACTION','PRAYER_ACK','CHURCH_REVIEW','CHURCH_CONNECTION','CHURCH_ROLE','CHURCH_CAPABILITY','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CHANGED','VOLUNTEER_REQUEST','VOLUNTEER_CONFIRMATION','FEEDBACK_CASE','FEEDBACK_IDEA','PHOTO_TAG_REQUEST','PHOTO_TAG_APPROVED','FRIEND_CONNECTED','EXCHANGE_MATCH') AND "recipientId" IS NOT NULL AND "sourceId" IS NOT NULL AND "sourceVersion" IS NOT NULL
   AND "notificationCategory" IS NOT NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL
   AND ((kind IN ('AUTHOR_POST','POST_MENTION','POST_REACTION') AND "postId" IS NOT NULL AND "commentId" IS NULL)
     OR (kind='COMMENT_REACTION' AND "postId" IS NOT NULL AND "commentId" IS NOT NULL)
     OR (kind='PRAYER_ACK' AND "postId" IS NOT NULL)
     OR (kind IN ('VOLUNTEER_CHANGED','VOLUNTEER_REQUEST') AND "postId" IS NOT NULL AND "commentId" IS NULL)
     OR (kind IN ('CHURCH_REVIEW','CHURCH_CONNECTION','CHURCH_ROLE','CHURCH_CAPABILITY','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CONFIRMATION','FEEDBACK_CASE','FEEDBACK_IDEA','PHOTO_TAG_REQUEST','PHOTO_TAG_APPROVED','FRIEND_CONNECTED','EXCHANGE_MATCH') AND "postId" IS NULL AND "commentId" IS NULL)))
);

ALTER TABLE "NotificationFanoutJob" DROP CONSTRAINT "NotificationFanoutJob_shape_check";
ALTER TABLE "NotificationFanoutJob" ADD CONSTRAINT "NotificationFanoutJob_shape_check" CHECK (
 kind IN ('AUTHOR_POST','CHURCH_REVIEW','EVENT_CHANGED','VOLUNTEER_CHANGED','VOLUNTEER_REQUEST','FEEDBACK_IDEA','EXCHANGE_LISTING')
 AND phase IN ('PRIMARY','SECONDARY') AND "sourceVersion">0
 AND length("sourceId") BETWEEN 1 AND 100 AND length("actorId") BETWEEN 1 AND 100
 AND (cursor IS NULL OR length(cursor) BETWEEN 1 AND 100));

COMMIT;
