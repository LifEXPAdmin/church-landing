-- AlterTable
ALTER TABLE "PlatformPost" ADD COLUMN     "exchangeNeedId" TEXT;

-- AlterTable
ALTER TABLE "PostVolunteerSignup" ADD COLUMN     "completedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ExchangeNeed" (
    "id" TEXT NOT NULL,
    "listingId" TEXT,
    "coordinatorId" TEXT,
    "coordinatorKey" TEXT,
    "consentVersion" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "recoveryRequired" BOOLEAN NOT NULL DEFAULT false,
    "deadlineLocal" TEXT,
    "timeZone" TEXT,
    "deadlineAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "closeReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeNeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeNeedSlot" (
    "id" TEXT NOT NULL,
    "needId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT NOT NULL DEFAULT '',
    "loan" BOOLEAN NOT NULL DEFAULT false,
    "returnLocal" TEXT,
    "returnTimeZone" TEXT,
    "returnAt" TIMESTAMP(3),
    "returnResponsibility" TEXT NOT NULL DEFAULT '',
    "volunteerSlotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeNeedSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeNeedContribution" (
    "id" TEXT NOT NULL,
    "needId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "contributorId" TEXT,
    "coordinatorId" TEXT,
    "authorityKey" TEXT,
    "consentVersion" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "received" INTEGER NOT NULL DEFAULT 0,
    "returned" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT NOT NULL DEFAULT '',
    "quoteMinor" INTEGER,
    "quoteCurrency" TEXT,
    "shareName" BOOLEAN NOT NULL DEFAULT false,
    "loanReturnAt" TIMESTAMP(3),
    "loanResponsibility" TEXT NOT NULL DEFAULT '',
    "disputedAt" TIMESTAMP(3),
    "disputeNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ExchangeNeedContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeNeedEvent" (
    "id" TEXT NOT NULL,
    "needId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "targetId" TEXT,
    "text" TEXT NOT NULL DEFAULT '',
    "previousQuantity" INTEGER,
    "quantity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeNeedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeNeed_listingId_key" ON "ExchangeNeed"("listingId");

-- CreateIndex
CREATE INDEX "ExchangeNeed_coordinatorId_updatedAt_id_idx" ON "ExchangeNeed"("coordinatorId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "ExchangeNeed_deadlineAt_closedAt_id_idx" ON "ExchangeNeed"("deadlineAt", "closedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeNeedSlot_volunteerSlotId_key" ON "ExchangeNeedSlot"("volunteerSlotId");

-- CreateIndex
CREATE INDEX "ExchangeNeedSlot_needId_createdAt_id_idx" ON "ExchangeNeedSlot"("needId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ExchangeNeedContribution_needId_createdAt_id_idx" ON "ExchangeNeedContribution"("needId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ExchangeNeedContribution_slotId_state_id_idx" ON "ExchangeNeedContribution"("slotId", "state", "id");

-- CreateIndex
CREATE INDEX "ExchangeNeedContribution_contributorId_createdAt_id_idx" ON "ExchangeNeedContribution"("contributorId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ExchangeNeedEvent_needId_createdAt_id_idx" ON "ExchangeNeedEvent"("needId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeNeedEvent_needId_version_key" ON "ExchangeNeedEvent"("needId", "version");

-- AddForeignKey
ALTER TABLE "ExchangeNeed" ADD CONSTRAINT "ExchangeNeed_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ExchangeListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeNeed" ADD CONSTRAINT "ExchangeNeed_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeNeedSlot" ADD CONSTRAINT "ExchangeNeedSlot_needId_fkey" FOREIGN KEY ("needId") REFERENCES "ExchangeNeed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeNeedSlot" ADD CONSTRAINT "ExchangeNeedSlot_volunteerSlotId_fkey" FOREIGN KEY ("volunteerSlotId") REFERENCES "PostVolunteerSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeNeedContribution" ADD CONSTRAINT "ExchangeNeedContribution_needId_fkey" FOREIGN KEY ("needId") REFERENCES "ExchangeNeed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeNeedContribution" ADD CONSTRAINT "ExchangeNeedContribution_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ExchangeNeedSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeNeedContribution" ADD CONSTRAINT "ExchangeNeedContribution_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeNeedContribution" ADD CONSTRAINT "ExchangeNeedContribution_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeNeedEvent" ADD CONSTRAINT "ExchangeNeedEvent_needId_fkey" FOREIGN KEY ("needId") REFERENCES "ExchangeNeed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformPost" ADD CONSTRAINT "PlatformPost_exchangeNeedId_fkey" FOREIGN KEY ("exchangeNeedId") REFERENCES "ExchangeNeed"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Database backstops protect whole-unit claims even outside application code.
ALTER TABLE "ExchangeNeedSlot" ADD CONSTRAINT "ExchangeNeedSlot_quantity_check" CHECK (target BETWEEN 1 AND 10000),
 ADD CONSTRAINT "ExchangeNeedSlot_action_check" CHECK (action IN ('DONATE','SELL','TRANSPORT','VOLUNTEER')),
 ADD CONSTRAINT "ExchangeNeedSlot_volunteer_check" CHECK (action='VOLUNTEER' OR "volunteerSlotId" IS NULL),
 ADD CONSTRAINT "ExchangeNeedSlot_loan_check" CHECK (NOT loan OR action='DONATE');
ALTER TABLE "ExchangeNeedContribution" ADD CONSTRAINT "ExchangeNeedContribution_quantity_check" CHECK (quantity BETWEEN 1 AND 10000 AND received BETWEEN 0 AND quantity AND returned BETWEEN 0 AND received),
 ADD CONSTRAINT "ExchangeNeedContribution_state_check" CHECK (state IN ('COMMITTED','QUOTED','WAITLISTED','DECLINED','CANCELED','REVOKED')),
 ADD CONSTRAINT "ExchangeNeedContribution_quote_check" CHECK (("quoteMinor" IS NULL AND "quoteCurrency" IS NULL) OR ("quoteMinor" > 0 AND "quoteCurrency" IS NOT NULL)),
 ADD CONSTRAINT "ExchangeNeedContribution_pair_check" CHECK ("contributorId" IS NULL OR "coordinatorId" IS NULL OR "contributorId" <> "coordinatorId");
CREATE UNIQUE INDEX "ExchangeNeedContribution_one_active" ON "ExchangeNeedContribution" ("slotId", "contributorId") WHERE state IN ('COMMITTED','QUOTED','WAITLISTED') AND "contributorId" IS NOT NULL;

ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_kind_check";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_kind_check" CHECK (
 kind IN ('REPORT','HOLD','MODERATION_POST','MODERATION_COMMENT','MODERATION_TOPIC','MODERATION_EXCHANGE',
 'TOPIC_ACCESS','POST_DISCOVERY','EXCHANGE_VISIBILITY','EXCHANGE_FAVORITE','EXCHANGE_SAVED_SEARCH','EXCHANGE_NEED','EXCHANGE_INQUIRY','EXCHANGE_CONTACT','EXCHANGE_DEFAULTS','DISCOVERY_PREFERENCES','FOLLOWING_LISTS','NOTIFICATION_PREFERENCES',
 'AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','APPEAL','ACCOUNT_STATE',
 'AUTHOR_WITHDRAW_POST','AUTHOR_WITHDRAW_COMMENT','SUPPORT_MESSAGE','SUPPORT_ATTACHMENT','FEEDBACK_PROMPT',
 'FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION','FEEDBACK_REVIEW','PHOTO_TAG','PHOTO_TAG_PREFERENCES','PROFILE_LOCATION'));
ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_account_scope";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_account_scope" CHECK (
 (kind IN ('ACCOUNT_STATE','FEEDBACK_PROMPT') AND target::text='ACCOUNT' AND "sourceId"="targetId")
 OR (kind IN ('TOPIC_ACCESS','POST_DISCOVERY','EXCHANGE_VISIBILITY','EXCHANGE_FAVORITE','EXCHANGE_SAVED_SEARCH','EXCHANGE_NEED','EXCHANGE_INQUIRY','EXCHANGE_CONTACT','EXCHANGE_DEFAULTS','DISCOVERY_PREFERENCES','FOLLOWING_LISTS','NOTIFICATION_PREFERENCES','AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION','FEEDBACK_REVIEW','PHOTO_TAG','PHOTO_TAG_PREFERENCES','PROFILE_LOCATION') AND target::text='ACCOUNT')
 OR (kind NOT IN ('ACCOUNT_STATE','FEEDBACK_PROMPT','TOPIC_ACCESS','POST_DISCOVERY','EXCHANGE_VISIBILITY','EXCHANGE_FAVORITE','EXCHANGE_SAVED_SEARCH','EXCHANGE_NEED','EXCHANGE_INQUIRY','EXCHANGE_CONTACT','EXCHANGE_DEFAULTS','DISCOVERY_PREFERENCES','FOLLOWING_LISTS','NOTIFICATION_PREFERENCES','AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION','FEEDBACK_REVIEW','PHOTO_TAG','PHOTO_TAG_PREFERENCES','PROFILE_LOCATION') AND target::text<>'ACCOUNT'));


ALTER TYPE "CommunityReportTarget" ADD VALUE 'NEED_CONTRIBUTION';
ALTER TABLE "ExchangeNeed" ADD COLUMN "deadlineNoticeAt" TIMESTAMP(3);
ALTER TABLE "SocialPreferences" DROP CONSTRAINT "SocialPreferences_notification_shape_check";
ALTER TABLE "SocialPreferences" ADD CONSTRAINT "SocialPreferences_notification_shape_check" CHECK (
  "notificationVersion" >= 0 AND cardinality("mutedNotificationCategories") <= 17
  AND "mutedNotificationCategories" <@ ARRAY['messages','requests','reports','founder','replies','mentions','conversations','prayer','posts','reactions','church','commitments','feedback','photos','exchange','handoffs','needs']::TEXT[]
  AND ("notificationPushSince" IS NULL OR (jsonb_typeof("notificationPushSince")='object' AND octet_length("notificationPushSince"::text) <= 2048)));
ALTER TABLE "SocialEvent" DROP CONSTRAINT "SocialEvent_notification_source_check";
ALTER TABLE "SocialEvent" ADD CONSTRAINT "SocialEvent_notification_source_check" CHECK (
  ("sourceVersion" IS NULL OR "sourceVersion" > 0) AND ("sourceId" IS NULL OR length("sourceId") BETWEEN 1 AND 100)
  AND ("notificationCategory" IS NULL OR "notificationCategory" IN ('messages','requests','reports','founder','replies','mentions','conversations','prayer','posts','reactions','church','commitments','feedback','photos','exchange','handoffs','needs')));
ALTER TABLE "SocialPreferences" DROP CONSTRAINT notification_choices;
ALTER TABLE "SocialPreferences" ADD CONSTRAINT notification_choices CHECK (
  "pushCategories" <@ ARRAY['messages','requests','reports','founder','replies','mentions','conversations','prayer','posts','reactions','church','commitments','feedback','photos','exchange','handoffs','needs']::text[] AND
  (("quietStart" IS NULL AND "quietEnd" IS NULL AND "quietTimeZone" IS NULL) OR
   ("quietStart" IS NOT NULL AND "quietEnd" IS NOT NULL AND "quietTimeZone" IS NOT NULL AND
    "quietStart" BETWEEN 0 AND 1439 AND "quietEnd" BETWEEN 0 AND 1439 AND
    "quietStart" <> "quietEnd" AND char_length("quietTimeZone") BETWEEN 1 AND 100))
);


ALTER TABLE "SocialEvent" DROP CONSTRAINT "SocialEvent_source_shape";
ALTER TABLE "SocialEvent" ADD CONSTRAINT "SocialEvent_source_shape" CHECK (
 ("kind" NOT IN ('PUSH_TEST','REPORT_RECEIVED','REPORT_RECONSIDERATION','CONTENT_DECISION','AUTHOR_POST','POST_MENTION','POST_REACTION','COMMENT_REACTION','PRAYER_ACK','CHURCH_REVIEW','CHURCH_CONNECTION','CHURCH_ROLE','CHURCH_CAPABILITY','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CHANGED','VOLUNTEER_REQUEST','VOLUNTEER_CONFIRMATION','FEEDBACK_CASE','FEEDBACK_IDEA','PHOTO_TAG_REQUEST','PHOTO_TAG_APPROVED','FRIEND_CONNECTED','EXCHANGE_MATCH','EXCHANGE_INQUIRY','EXCHANGE_HANDOFF','EXCHANGE_REMINDER','NEED_UPDATE','NEED_CONTRIBUTION') AND "kind" NOT LIKE 'ADULT_%' AND "postId" IS NOT NULL AND "commentId" IS NOT NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL)
 OR ("kind" = 'ADULT_REQUEST_CREATED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NOT NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'ADULT_REQUEST_ACCEPTED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NOT NULL AND "conversationId" IS NOT NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'ADULT_MESSAGE_CREATED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NOT NULL AND "messageId" IS NOT NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" IN ('REPORT_RECEIVED','REPORT_RECONSIDERATION') AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NOT NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'CONTENT_DECISION' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NOT NULL AND "decisionId" IS NOT NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'PUSH_TEST' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" = "actorId" AND "recipientId" IS NOT NULL)
 OR (kind IN ('AUTHOR_POST','POST_MENTION','POST_REACTION','COMMENT_REACTION','PRAYER_ACK','CHURCH_REVIEW','CHURCH_CONNECTION','CHURCH_ROLE','CHURCH_CAPABILITY','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CHANGED','VOLUNTEER_REQUEST','VOLUNTEER_CONFIRMATION','FEEDBACK_CASE','FEEDBACK_IDEA','PHOTO_TAG_REQUEST','PHOTO_TAG_APPROVED','FRIEND_CONNECTED','EXCHANGE_MATCH','EXCHANGE_INQUIRY','EXCHANGE_HANDOFF','EXCHANGE_REMINDER','NEED_UPDATE','NEED_CONTRIBUTION') AND "recipientId" IS NOT NULL AND "sourceId" IS NOT NULL AND "sourceVersion" IS NOT NULL
   AND "notificationCategory" IS NOT NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL
   AND ((kind IN ('AUTHOR_POST','POST_MENTION','POST_REACTION') AND "postId" IS NOT NULL AND "commentId" IS NULL)
     OR (kind='COMMENT_REACTION' AND "postId" IS NOT NULL AND "commentId" IS NOT NULL)
     OR (kind='PRAYER_ACK' AND "postId" IS NOT NULL)
     OR (kind IN ('VOLUNTEER_CHANGED','VOLUNTEER_REQUEST') AND "postId" IS NOT NULL AND "commentId" IS NULL)
     OR (kind IN ('CHURCH_REVIEW','CHURCH_CONNECTION','CHURCH_ROLE','CHURCH_CAPABILITY','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CONFIRMATION','FEEDBACK_CASE','FEEDBACK_IDEA','PHOTO_TAG_REQUEST','PHOTO_TAG_APPROVED','FRIEND_CONNECTED','EXCHANGE_MATCH','EXCHANGE_INQUIRY','EXCHANGE_HANDOFF','EXCHANGE_REMINDER','NEED_UPDATE','NEED_CONTRIBUTION') AND "postId" IS NULL AND "commentId" IS NULL)))
);


ALTER TABLE "NotificationFanoutJob" DROP CONSTRAINT "NotificationFanoutJob_shape_check";
ALTER TABLE "NotificationFanoutJob" ADD CONSTRAINT "NotificationFanoutJob_shape_check" CHECK (
 kind IN ('AUTHOR_POST','CHURCH_REVIEW','EVENT_CHANGED','VOLUNTEER_CHANGED','VOLUNTEER_REQUEST','FEEDBACK_IDEA','EXCHANGE_LISTING','NEED_UPDATE')
 AND phase IN ('PRIMARY','SECONDARY') AND "sourceVersion">0
 AND length("sourceId") BETWEEN 1 AND 100 AND length("actorId") BETWEEN 1 AND 100
 AND (cursor IS NULL OR length(cursor) BETWEEN 1 AND 100));

