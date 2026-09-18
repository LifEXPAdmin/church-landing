-- AlterEnum
ALTER TYPE "ChurchCapability" ADD VALUE 'MANAGE_CHURCH_ASSISTANCE';

-- AlterEnum
ALTER TYPE "CommunityReportTarget" ADD VALUE 'PANTRY_REQUEST';

-- CreateTable
CREATE TABLE "PantryHub" (
    "id" TEXT NOT NULL,
    "churchId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "audience" TEXT NOT NULL DEFAULT 'CHURCH',
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "hours" TEXT NOT NULL DEFAULT '',
    "accessInfo" TEXT NOT NULL DEFAULT '',
    "eligibility" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "intakeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "coordinatorId" TEXT,
    "coordinatorKey" TEXT,
    "consentVersion" INTEGER NOT NULL DEFAULT 1,
    "accessVersion" INTEGER NOT NULL DEFAULT 1,
    "recoveryRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PantryHub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PantryCategory" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "availability" TEXT NOT NULL DEFAULT 'APPROXIMATE',
    "quantity" INTEGER,
    "description" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "replenishmentNeedId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PantryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PantrySession" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "pickupDetails" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PantrySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PantryRequest" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "requesterId" TEXT,
    "coordinatorId" TEXT,
    "authorityKey" TEXT,
    "consentVersion" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "state" TEXT NOT NULL DEFAULT 'REQUESTED',
    "items" JSONB NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "pickupContact" TEXT NOT NULL DEFAULT '',
    "coordinatorNote" TEXT NOT NULL DEFAULT '',
    "sessionId" TEXT,
    "sessionVersion" INTEGER,
    "confirmedAt" TIMESTAMP(3),
    "requesterClearedAt" TIMESTAMP(3),
    "coordinatorClearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "PantryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PantryEvent" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "previousQuantity" INTEGER,
    "quantity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PantryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PantryHub_churchId_key" ON "PantryHub"("churchId");

-- CreateIndex
CREATE INDEX "PantryHub_published_audience_id_idx" ON "PantryHub"("published", "audience", "id");

-- CreateIndex
CREATE INDEX "PantryCategory_hubId_active_id_idx" ON "PantryCategory"("hubId", "active", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PantryCategory_id_hubId_key" ON "PantryCategory"("id", "hubId");

-- CreateIndex
CREATE INDEX "PantrySession_hubId_startsAt_id_idx" ON "PantrySession"("hubId", "startsAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PantrySession_id_hubId_key" ON "PantrySession"("id", "hubId");

-- CreateIndex
CREATE INDEX "PantryRequest_hubId_state_id_idx" ON "PantryRequest"("hubId", "state", "id");

-- CreateIndex
CREATE INDEX "PantryRequest_requesterId_id_idx" ON "PantryRequest"("requesterId", "id");

-- CreateIndex
CREATE INDEX "PantryRequest_coordinatorId_id_idx" ON "PantryRequest"("coordinatorId", "id");

-- CreateIndex
CREATE INDEX "PantryRequest_sessionId_state_idx" ON "PantryRequest"("sessionId", "state");

-- CreateIndex
CREATE INDEX "PantryEvent_hubId_createdAt_id_idx" ON "PantryEvent"("hubId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PantryEvent_hubId_version_key" ON "PantryEvent"("hubId", "version");

-- AddForeignKey
ALTER TABLE "PantryHub" ADD CONSTRAINT "PantryHub_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantryHub" ADD CONSTRAINT "PantryHub_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantryCategory" ADD CONSTRAINT "PantryCategory_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "PantryHub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantrySession" ADD CONSTRAINT "PantrySession_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "PantryHub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantryRequest" ADD CONSTRAINT "PantryRequest_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "PantryHub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantryRequest" ADD CONSTRAINT "PantryRequest_sessionId_hubId_fkey" FOREIGN KEY ("sessionId", "hubId") REFERENCES "PantrySession"("id", "hubId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantryRequest" ADD CONSTRAINT "PantryRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantryRequest" ADD CONSTRAINT "PantryRequest_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantryEvent" ADD CONSTRAINT "PantryEvent_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "PantryHub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Fail closed for malformed ownership, state, counts or restored private data.
ALTER TABLE "PantryHub" ADD CONSTRAINT "PantryHub_shape" CHECK (
  version > 0 AND "consentVersion" > 0 AND "accessVersion" > 0 AND
  audience IN ('PUBLIC','CHURCH') AND ("churchId" IS NULL OR id="churchId") AND
  (NOT published OR ("churchId" IS NOT NULL AND length(title)>=3 AND length(hours)>=3 AND length("accessInfo")>=3)) AND
  (NOT "intakeEnabled" OR ("coordinatorId" IS NOT NULL AND "coordinatorKey" IS NOT NULL)) AND
  (NOT "recoveryRequired" OR (NOT published AND NOT "intakeEnabled" AND "coordinatorKey" IS NULL))
);
ALTER TABLE "PantryCategory" ADD CONSTRAINT "PantryCategory_shape" CHECK (
  version > 0 AND length(label) BETWEEN 2 AND 80 AND length(unit) BETWEEN 1 AND 40 AND
  availability IN ('EXACT','APPROXIMATE','UNAVAILABLE') AND
  ((availability='EXACT' AND quantity IS NOT NULL AND quantity BETWEEN 0 AND 10000) OR
   (availability<>'EXACT' AND quantity IS NULL))
);
ALTER TABLE "PantrySession" ADD CONSTRAINT "PantrySession_shape" CHECK (
  version > 0 AND capacity BETWEEN 1 AND 100 AND "endsAt">"startsAt" AND
  "endsAt"-"startsAt"<=interval '1 day' AND length("pickupDetails") BETWEEN 3 AND 1000
);
ALTER TABLE "PantryRequest" ADD CONSTRAINT "PantryRequest_shape" CHECK (
  version > 0 AND "consentVersion">0 AND
  state IN ('REQUESTED','ASSIGNED','COLLECTED','CANCELED','DECLINED','MISSED','REVOKED') AND
  jsonb_typeof(items)='array' AND jsonb_array_length(items)<=12 AND
  (state NOT IN ('ASSIGNED','COLLECTED','MISSED') OR ("sessionId" IS NOT NULL AND "sessionVersion">0)) AND
  (state IN ('REQUESTED','ASSIGNED') OR "endedAt" IS NOT NULL) AND
  (state <> 'REVOKED' OR "authorityKey" IS NULL) AND
  length(note)<=500 AND length("pickupContact")<=200 AND length("coordinatorNote")<=1000 AND
  ("requesterId" IS NULL OR "coordinatorId" IS NULL OR "requesterId"<>"coordinatorId")
);
CREATE UNIQUE INDEX "PantryRequest_one_active_per_hub" ON "PantryRequest"("hubId","requesterId")
  WHERE state IN ('REQUESTED','ASSIGNED') AND "requesterId" IS NOT NULL;
ALTER TABLE "PantryEvent" ADD CONSTRAINT "PantryEvent_shape" CHECK (
  version>0 AND length(reason)<=300 AND
  ("previousQuantity" IS NULL OR "previousQuantity" BETWEEN 0 AND 10000) AND
  (quantity IS NULL OR quantity BETWEEN 0 AND 10000)
);

-- Extend the existing strict recovery and notification shapes.
ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_kind_check";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_kind_check" CHECK (
 kind IN ('REPORT','HOLD','MODERATION_POST','MODERATION_COMMENT','MODERATION_TOPIC','MODERATION_EXCHANGE',
 'TOPIC_ACCESS','POST_DISCOVERY','EXCHANGE_VISIBILITY','EXCHANGE_FAVORITE','EXCHANGE_SAVED_SEARCH','EXCHANGE_NEED','PANTRY_HUB','EXCHANGE_INQUIRY','EXCHANGE_CONTACT','EXCHANGE_DEFAULTS','DISCOVERY_PREFERENCES','FOLLOWING_LISTS','NOTIFICATION_PREFERENCES',
 'AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','APPEAL','ACCOUNT_STATE',
 'AUTHOR_WITHDRAW_POST','AUTHOR_WITHDRAW_COMMENT','SUPPORT_MESSAGE','SUPPORT_ATTACHMENT','FEEDBACK_PROMPT',
 'FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION','FEEDBACK_REVIEW','PHOTO_TAG','PHOTO_TAG_PREFERENCES','PROFILE_LOCATION'));
ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_account_scope";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_account_scope" CHECK (
 (kind IN ('ACCOUNT_STATE','FEEDBACK_PROMPT') AND target::text='ACCOUNT' AND "sourceId"="targetId")
 OR (kind IN ('TOPIC_ACCESS','POST_DISCOVERY','EXCHANGE_VISIBILITY','EXCHANGE_FAVORITE','EXCHANGE_SAVED_SEARCH','EXCHANGE_NEED','PANTRY_HUB','EXCHANGE_INQUIRY','EXCHANGE_CONTACT','EXCHANGE_DEFAULTS','DISCOVERY_PREFERENCES','FOLLOWING_LISTS','NOTIFICATION_PREFERENCES','AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION','FEEDBACK_REVIEW','PHOTO_TAG','PHOTO_TAG_PREFERENCES','PROFILE_LOCATION') AND target::text='ACCOUNT')
 OR (kind NOT IN ('ACCOUNT_STATE','FEEDBACK_PROMPT','TOPIC_ACCESS','POST_DISCOVERY','EXCHANGE_VISIBILITY','EXCHANGE_FAVORITE','EXCHANGE_SAVED_SEARCH','EXCHANGE_NEED','PANTRY_HUB','EXCHANGE_INQUIRY','EXCHANGE_CONTACT','EXCHANGE_DEFAULTS','DISCOVERY_PREFERENCES','FOLLOWING_LISTS','NOTIFICATION_PREFERENCES','AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION','FEEDBACK_REVIEW','PHOTO_TAG','PHOTO_TAG_PREFERENCES','PROFILE_LOCATION') AND target::text<>'ACCOUNT'));


ALTER TABLE "SocialPreferences" DROP CONSTRAINT "SocialPreferences_notification_shape_check";
ALTER TABLE "SocialPreferences" ADD CONSTRAINT "SocialPreferences_notification_shape_check" CHECK (
  "notificationVersion" >= 0 AND cardinality("mutedNotificationCategories") <= 18
  AND "mutedNotificationCategories" <@ ARRAY['messages','requests','reports','founder','replies','mentions','conversations','prayer','posts','reactions','church','commitments','feedback','photos','exchange','handoffs','needs','assistance']::TEXT[]
  AND ("notificationPushSince" IS NULL OR (jsonb_typeof("notificationPushSince")='object' AND octet_length("notificationPushSince"::text) <= 2048)));
ALTER TABLE "SocialEvent" DROP CONSTRAINT "SocialEvent_notification_source_check";
ALTER TABLE "SocialEvent" ADD CONSTRAINT "SocialEvent_notification_source_check" CHECK (
  ("sourceVersion" IS NULL OR "sourceVersion" > 0) AND ("sourceId" IS NULL OR length("sourceId") BETWEEN 1 AND 100)
  AND ("notificationCategory" IS NULL OR "notificationCategory" IN ('messages','requests','reports','founder','replies','mentions','conversations','prayer','posts','reactions','church','commitments','feedback','photos','exchange','handoffs','needs','assistance')));
ALTER TABLE "SocialPreferences" DROP CONSTRAINT notification_choices;
ALTER TABLE "SocialPreferences" ADD CONSTRAINT notification_choices CHECK (
  "pushCategories" <@ ARRAY['messages','requests','reports','founder','replies','mentions','conversations','prayer','posts','reactions','church','commitments','feedback','photos','exchange','handoffs','needs','assistance']::text[] AND
  (("quietStart" IS NULL AND "quietEnd" IS NULL AND "quietTimeZone" IS NULL) OR
   ("quietStart" IS NOT NULL AND "quietEnd" IS NOT NULL AND "quietTimeZone" IS NOT NULL AND
    "quietStart" BETWEEN 0 AND 1439 AND "quietEnd" BETWEEN 0 AND 1439 AND
    "quietStart" <> "quietEnd" AND char_length("quietTimeZone") BETWEEN 1 AND 100))
);


ALTER TABLE "SocialEvent" DROP CONSTRAINT "SocialEvent_source_shape";
ALTER TABLE "SocialEvent" ADD CONSTRAINT "SocialEvent_source_shape" CHECK (
 ("kind" NOT IN ('PUSH_TEST','REPORT_RECEIVED','REPORT_RECONSIDERATION','CONTENT_DECISION','AUTHOR_POST','POST_MENTION','POST_REACTION','COMMENT_REACTION','PRAYER_ACK','CHURCH_REVIEW','CHURCH_CONNECTION','CHURCH_ROLE','CHURCH_CAPABILITY','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CHANGED','VOLUNTEER_REQUEST','VOLUNTEER_CONFIRMATION','FEEDBACK_CASE','FEEDBACK_IDEA','PHOTO_TAG_REQUEST','PHOTO_TAG_APPROVED','FRIEND_CONNECTED','EXCHANGE_MATCH','EXCHANGE_INQUIRY','EXCHANGE_HANDOFF','EXCHANGE_REMINDER','NEED_UPDATE','NEED_CONTRIBUTION','PANTRY_REQUEST') AND "kind" NOT LIKE 'ADULT_%' AND "postId" IS NOT NULL AND "commentId" IS NOT NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL)
 OR ("kind" = 'ADULT_REQUEST_CREATED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NOT NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'ADULT_REQUEST_ACCEPTED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NOT NULL AND "conversationId" IS NOT NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'ADULT_MESSAGE_CREATED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NOT NULL AND "messageId" IS NOT NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" IN ('REPORT_RECEIVED','REPORT_RECONSIDERATION') AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NOT NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'CONTENT_DECISION' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NOT NULL AND "decisionId" IS NOT NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'PUSH_TEST' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" = "actorId" AND "recipientId" IS NOT NULL)
 OR (kind IN ('AUTHOR_POST','POST_MENTION','POST_REACTION','COMMENT_REACTION','PRAYER_ACK','CHURCH_REVIEW','CHURCH_CONNECTION','CHURCH_ROLE','CHURCH_CAPABILITY','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CHANGED','VOLUNTEER_REQUEST','VOLUNTEER_CONFIRMATION','FEEDBACK_CASE','FEEDBACK_IDEA','PHOTO_TAG_REQUEST','PHOTO_TAG_APPROVED','FRIEND_CONNECTED','EXCHANGE_MATCH','EXCHANGE_INQUIRY','EXCHANGE_HANDOFF','EXCHANGE_REMINDER','NEED_UPDATE','NEED_CONTRIBUTION','PANTRY_REQUEST') AND "recipientId" IS NOT NULL AND "sourceId" IS NOT NULL AND "sourceVersion" IS NOT NULL
   AND "notificationCategory" IS NOT NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL
   AND ((kind IN ('AUTHOR_POST','POST_MENTION','POST_REACTION') AND "postId" IS NOT NULL AND "commentId" IS NULL)
     OR (kind='COMMENT_REACTION' AND "postId" IS NOT NULL AND "commentId" IS NOT NULL)
     OR (kind='PRAYER_ACK' AND "postId" IS NOT NULL)
     OR (kind IN ('VOLUNTEER_CHANGED','VOLUNTEER_REQUEST') AND "postId" IS NOT NULL AND "commentId" IS NULL)
     OR (kind IN ('CHURCH_REVIEW','CHURCH_CONNECTION','CHURCH_ROLE','CHURCH_CAPABILITY','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CONFIRMATION','FEEDBACK_CASE','FEEDBACK_IDEA','PHOTO_TAG_REQUEST','PHOTO_TAG_APPROVED','FRIEND_CONNECTED','EXCHANGE_MATCH','EXCHANGE_INQUIRY','EXCHANGE_HANDOFF','EXCHANGE_REMINDER','NEED_UPDATE','NEED_CONTRIBUTION','PANTRY_REQUEST') AND "postId" IS NULL AND "commentId" IS NULL)))
);


