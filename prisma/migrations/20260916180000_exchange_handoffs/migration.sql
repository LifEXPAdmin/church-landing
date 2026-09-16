BEGIN;
-- CreateEnum
CREATE TYPE "ExchangeInquiryState" AS ENUM ('INQUIRED', 'SELECTED', 'RESERVED', 'COMPLETED', 'CANCELED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'REVOKED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CommunityReportTarget" ADD VALUE 'EXCHANGE_INQUIRY';
ALTER TYPE "CommunityReportTarget" ADD VALUE 'EXCHANGE_HANDOFF';

-- AlterEnum
ALTER TYPE "RetentionTarget" ADD VALUE 'EXCHANGE_INQUIRY';

-- AlterTable
ALTER TABLE "ExchangeListing" ADD COLUMN     "inquiriesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inquiryAuthorityKey" TEXT,
ADD COLUMN     "inquiryContactVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "inquiryReceiverId" TEXT;

-- CreateTable
CREATE TABLE "ExchangeInquiry" (
    "id" TEXT NOT NULL,
    "listingId" TEXT,
    "requesterId" TEXT,
    "receiverId" TEXT,
    "contactVersion" INTEGER NOT NULL DEFAULT 0,
    "authorityKey" TEXT,
    "listingVersion" INTEGER NOT NULL DEFAULT 0,
    "state" "ExchangeInquiryState" NOT NULL DEFAULT 'INQUIRED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "planVersion" INTEGER NOT NULL DEFAULT 0,
    "recoveryRequired" BOOLEAN NOT NULL DEFAULT false,
    "purpose" TEXT NOT NULL DEFAULT '',
    "pickupDetails" TEXT NOT NULL DEFAULT '',
    "cancelReason" TEXT,
    "cancelNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "selectedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "timeZone" TEXT,
    "requesterClearedAt" TIMESTAMP(3),
    "receiverClearedAt" TIMESTAMP(3),
    "unretainedAt" TIMESTAMP(3),
    "bodyPurgedAt" TIMESTAMP(3),
    "wakeAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "dispatchClaimedAt" TIMESTAMP(3),
    "dispatchAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastDispatchErrorAt" TIMESTAMP(3),
    "remindedPlanVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExchangeInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeInquiryAudit" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "state" "ExchangeInquiryState" NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeInquiryAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeDefaults" (
    "ownerId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "schema" INTEGER NOT NULL DEFAULT 1,
    "intent" "ExchangeListingIntent" NOT NULL DEFAULT 'FREE',
    "audience" "PostAudience" NOT NULL DEFAULT 'PUBLIC',
    "audienceChurchId" TEXT,
    "country" TEXT,
    "placeId" INTEGER,
    "pickupDetails" TEXT NOT NULL DEFAULT '',
    "recoveryRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeDefaults_pkey" PRIMARY KEY ("ownerId")
);

-- CreateIndex
CREATE INDEX "ExchangeInquiry_requesterId_createdAt_id_idx" ON "ExchangeInquiry"("requesterId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ExchangeInquiry_receiverId_createdAt_id_idx" ON "ExchangeInquiry"("receiverId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ExchangeInquiry_listingId_state_id_idx" ON "ExchangeInquiry"("listingId", "state", "id");

-- CreateIndex
CREATE INDEX "ExchangeInquiry_state_expiresAt_id_idx" ON "ExchangeInquiry"("state", "expiresAt", "id");

-- CreateIndex
CREATE INDEX "ExchangeInquiry_wakeAt_dispatchedAt_id_idx" ON "ExchangeInquiry"("wakeAt", "dispatchedAt", "id");

-- CreateIndex
CREATE INDEX "ExchangeInquiry_unretainedAt_bodyPurgedAt_id_idx" ON "ExchangeInquiry"("unretainedAt", "bodyPurgedAt", "id");

-- CreateIndex
CREATE INDEX "ExchangeInquiryAudit_actorId_idx" ON "ExchangeInquiryAudit"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeInquiryAudit_inquiryId_version_key" ON "ExchangeInquiryAudit"("inquiryId", "version");

-- CreateIndex
CREATE INDEX "ExchangeListing_inquiryReceiverId_inquiriesEnabled_idx" ON "ExchangeListing"("inquiryReceiverId", "inquiriesEnabled");

-- AddForeignKey
ALTER TABLE "ExchangeListing" ADD CONSTRAINT "ExchangeListing_inquiryReceiverId_fkey" FOREIGN KEY ("inquiryReceiverId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeInquiry" ADD CONSTRAINT "ExchangeInquiry_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ExchangeListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeInquiry" ADD CONSTRAINT "ExchangeInquiry_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeInquiry" ADD CONSTRAINT "ExchangeInquiry_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeInquiryAudit" ADD CONSTRAINT "ExchangeInquiryAudit_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "ExchangeInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeInquiryAudit" ADD CONSTRAINT "ExchangeInquiryAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeDefaults" ADD CONSTRAINT "ExchangeDefaults_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Holds and active inquiry uniqueness are independent of request order or retries.
CREATE UNIQUE INDEX "ExchangeInquiry_one_active_requester" ON "ExchangeInquiry" ("listingId", "requesterId")
  WHERE state IN ('INQUIRED','SELECTED','RESERVED');
CREATE UNIQUE INDEX "ExchangeInquiry_one_held_listing" ON "ExchangeInquiry" ("listingId")
  WHERE state IN ('SELECTED','RESERVED');
ALTER TABLE "ExchangeListing" ADD CONSTRAINT "ExchangeListing_contact_shape" CHECK (
  "inquiryContactVersion" >= 0
  AND ("inquiryAuthorityKey" IS NULL OR "inquiryAuthorityKey" ~ '^[a-f0-9]{64}$')
  AND (NOT "inquiriesEnabled" OR ("inquiryContactVersion">0 AND "inquiryReceiverId" IS NOT NULL AND "inquiryAuthorityKey" IS NOT NULL)));
ALTER TABLE "ExchangeInquiry" ADD CONSTRAINT "ExchangeInquiry_shape" CHECK (
  length(id) BETWEEN 1 AND 100 AND version>0 AND "planVersion">=0 AND "contactVersion">=0 AND "listingVersion">=0
  AND length(purpose)<=1000 AND length("pickupDetails")<=2000 AND length("cancelNote")<=500
  AND ("cancelReason" IS NULL OR "cancelReason" IN ('CHANGED_PLANS','ITEM_UNAVAILABLE','COULD_NOT_AGREE','NO_SHOW','OTHER'))
  AND ("requesterId" IS NULL OR "receiverId" IS NULL OR "requesterId"<>"receiverId")
  AND (state NOT IN ('INQUIRED','SELECTED','RESERVED') OR
    ("listingId" IS NOT NULL AND "requesterId" IS NOT NULL AND "receiverId" IS NOT NULL
      AND "contactVersion">0 AND "listingVersion">0 AND "authorityKey" IS NOT NULL
      AND length(trim(purpose))>0 AND "endedAt" IS NULL AND NOT "recoveryRequired"))
  AND ("authorityKey" IS NULL OR "authorityKey" ~ '^[a-f0-9]{64}$')
  AND (("windowStart" IS NULL AND "windowEnd" IS NULL AND "timeZone" IS NULL) OR
    ("windowStart" IS NOT NULL AND "windowEnd" IS NOT NULL AND "timeZone" IS NOT NULL
      AND "windowEnd">"windowStart" AND "windowEnd"<="windowStart"+interval '24 hours' AND length("timeZone") BETWEEN 1 AND 100))
  AND (state NOT IN ('SELECTED','RESERVED') OR ("windowStart" IS NOT NULL AND "selectedAt" IS NOT NULL AND "planVersion">0))
  AND (state<>'RESERVED' OR "confirmedAt" IS NOT NULL)
  AND (("requesterClearedAt" IS NULL AND "receiverClearedAt" IS NULL) OR state NOT IN ('INQUIRED','SELECTED','RESERVED'))
  AND ("bodyPurgedAt" IS NULL OR (purpose='' AND "pickupDetails"='' AND "cancelNote"=''))
  AND (NOT "recoveryRequired" OR (state='REVOKED' AND purpose='' AND "pickupDetails"='' AND "cancelNote"='' AND "wakeAt" IS NULL))
  AND "dispatchAttempts">=0 AND "remindedPlanVersion">=0);
ALTER TABLE "ExchangeInquiryAudit" ADD CONSTRAINT "ExchangeInquiryAudit_shape" CHECK (
  version>0 AND length(action) BETWEEN 1 AND 40);
ALTER TABLE "ExchangeDefaults" ADD CONSTRAINT "ExchangeDefaults_shape" CHECK (
  version>0 AND schema=1 AND intent IN ('FREE','SALE','WANTED','SERVICE')
  AND audience IN ('PUBLIC','CHURCH') AND ((audience='CHURCH')=("audienceChurchId" IS NOT NULL))
  AND (country IS NULL OR country ~ '^[A-Z]{2}$')
  AND ("placeId" IS NULL OR (country IS NOT NULL AND "placeId" BETWEEN 1 AND 100000000))
  AND length("pickupDetails")<=2000 AND (NOT "recoveryRequired" OR "pickupDetails"=''));

ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_kind_check";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_kind_check" CHECK (
 kind IN ('REPORT','HOLD','MODERATION_POST','MODERATION_COMMENT','MODERATION_TOPIC','MODERATION_EXCHANGE',
 'TOPIC_ACCESS','POST_DISCOVERY','EXCHANGE_VISIBILITY','EXCHANGE_FAVORITE','EXCHANGE_SAVED_SEARCH','EXCHANGE_INQUIRY','EXCHANGE_CONTACT','EXCHANGE_DEFAULTS','DISCOVERY_PREFERENCES','NOTIFICATION_PREFERENCES',
 'AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','APPEAL','ACCOUNT_STATE',
 'AUTHOR_WITHDRAW_POST','AUTHOR_WITHDRAW_COMMENT','SUPPORT_MESSAGE','SUPPORT_ATTACHMENT','FEEDBACK_PROMPT',
 'FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION','FEEDBACK_REVIEW','PHOTO_TAG','PHOTO_TAG_PREFERENCES','PROFILE_LOCATION'));
ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_account_scope";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_account_scope" CHECK (
 (kind IN ('ACCOUNT_STATE','FEEDBACK_PROMPT') AND target::text='ACCOUNT' AND "sourceId"="targetId")
 OR (kind IN ('TOPIC_ACCESS','POST_DISCOVERY','EXCHANGE_VISIBILITY','EXCHANGE_FAVORITE','EXCHANGE_SAVED_SEARCH','EXCHANGE_INQUIRY','EXCHANGE_CONTACT','EXCHANGE_DEFAULTS','DISCOVERY_PREFERENCES','NOTIFICATION_PREFERENCES','AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION','FEEDBACK_REVIEW','PHOTO_TAG','PHOTO_TAG_PREFERENCES','PROFILE_LOCATION') AND target::text='ACCOUNT')
 OR (kind NOT IN ('ACCOUNT_STATE','FEEDBACK_PROMPT','TOPIC_ACCESS','POST_DISCOVERY','EXCHANGE_VISIBILITY','EXCHANGE_FAVORITE','EXCHANGE_SAVED_SEARCH','EXCHANGE_INQUIRY','EXCHANGE_CONTACT','EXCHANGE_DEFAULTS','DISCOVERY_PREFERENCES','NOTIFICATION_PREFERENCES','AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION','FEEDBACK_REVIEW','PHOTO_TAG','PHOTO_TAG_PREFERENCES','PROFILE_LOCATION') AND target::text<>'ACCOUNT'));

ALTER TABLE "SocialPreferences" DROP CONSTRAINT "SocialPreferences_notification_shape_check";
ALTER TABLE "SocialPreferences" ADD CONSTRAINT "SocialPreferences_notification_shape_check" CHECK (
  "notificationVersion" >= 0 AND cardinality("mutedNotificationCategories") <= 16
  AND "mutedNotificationCategories" <@ ARRAY['messages','requests','reports','founder','replies','mentions','conversations','prayer','posts','reactions','church','commitments','feedback','photos','exchange','handoffs']::TEXT[]
  AND ("notificationPushSince" IS NULL OR (jsonb_typeof("notificationPushSince")='object' AND octet_length("notificationPushSince"::text) <= 2048)));
ALTER TABLE "SocialEvent" DROP CONSTRAINT "SocialEvent_notification_source_check";
ALTER TABLE "SocialEvent" ADD CONSTRAINT "SocialEvent_notification_source_check" CHECK (
  ("sourceVersion" IS NULL OR "sourceVersion" > 0) AND ("sourceId" IS NULL OR length("sourceId") BETWEEN 1 AND 100)
  AND ("notificationCategory" IS NULL OR "notificationCategory" IN ('messages','requests','reports','founder','replies','mentions','conversations','prayer','posts','reactions','church','commitments','feedback','photos','exchange','handoffs')));
ALTER TABLE "SocialPreferences" DROP CONSTRAINT notification_choices;
ALTER TABLE "SocialPreferences" ADD CONSTRAINT notification_choices CHECK (
  "pushCategories" <@ ARRAY['messages','requests','reports','founder','replies','mentions','conversations','prayer','posts','reactions','church','commitments','feedback','photos','exchange','handoffs']::text[] AND
  (("quietStart" IS NULL AND "quietEnd" IS NULL AND "quietTimeZone" IS NULL) OR
   ("quietStart" IS NOT NULL AND "quietEnd" IS NOT NULL AND "quietTimeZone" IS NOT NULL AND
    "quietStart" BETWEEN 0 AND 1439 AND "quietEnd" BETWEEN 0 AND 1439 AND
    "quietStart" <> "quietEnd" AND char_length("quietTimeZone") BETWEEN 1 AND 100))
);


ALTER TABLE "SocialEvent" DROP CONSTRAINT "SocialEvent_source_shape";
ALTER TABLE "SocialEvent" ADD CONSTRAINT "SocialEvent_source_shape" CHECK (
 ("kind" NOT IN ('PUSH_TEST','REPORT_RECEIVED','REPORT_RECONSIDERATION','CONTENT_DECISION','AUTHOR_POST','POST_MENTION','POST_REACTION','COMMENT_REACTION','PRAYER_ACK','CHURCH_REVIEW','CHURCH_CONNECTION','CHURCH_ROLE','CHURCH_CAPABILITY','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CHANGED','VOLUNTEER_REQUEST','VOLUNTEER_CONFIRMATION','FEEDBACK_CASE','FEEDBACK_IDEA','PHOTO_TAG_REQUEST','PHOTO_TAG_APPROVED','FRIEND_CONNECTED','EXCHANGE_MATCH','EXCHANGE_INQUIRY','EXCHANGE_HANDOFF','EXCHANGE_REMINDER') AND "kind" NOT LIKE 'ADULT_%' AND "postId" IS NOT NULL AND "commentId" IS NOT NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL)
 OR ("kind" = 'ADULT_REQUEST_CREATED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NOT NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'ADULT_REQUEST_ACCEPTED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NOT NULL AND "conversationId" IS NOT NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'ADULT_MESSAGE_CREATED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NOT NULL AND "messageId" IS NOT NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" IN ('REPORT_RECEIVED','REPORT_RECONSIDERATION') AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NOT NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'CONTENT_DECISION' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NOT NULL AND "decisionId" IS NOT NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'PUSH_TEST' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" = "actorId" AND "recipientId" IS NOT NULL)
 OR (kind IN ('AUTHOR_POST','POST_MENTION','POST_REACTION','COMMENT_REACTION','PRAYER_ACK','CHURCH_REVIEW','CHURCH_CONNECTION','CHURCH_ROLE','CHURCH_CAPABILITY','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CHANGED','VOLUNTEER_REQUEST','VOLUNTEER_CONFIRMATION','FEEDBACK_CASE','FEEDBACK_IDEA','PHOTO_TAG_REQUEST','PHOTO_TAG_APPROVED','FRIEND_CONNECTED','EXCHANGE_MATCH','EXCHANGE_INQUIRY','EXCHANGE_HANDOFF','EXCHANGE_REMINDER') AND "recipientId" IS NOT NULL AND "sourceId" IS NOT NULL AND "sourceVersion" IS NOT NULL
   AND "notificationCategory" IS NOT NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL
   AND ((kind IN ('AUTHOR_POST','POST_MENTION','POST_REACTION') AND "postId" IS NOT NULL AND "commentId" IS NULL)
     OR (kind='COMMENT_REACTION' AND "postId" IS NOT NULL AND "commentId" IS NOT NULL)
     OR (kind='PRAYER_ACK' AND "postId" IS NOT NULL)
     OR (kind IN ('VOLUNTEER_CHANGED','VOLUNTEER_REQUEST') AND "postId" IS NOT NULL AND "commentId" IS NULL)
     OR (kind IN ('CHURCH_REVIEW','CHURCH_CONNECTION','CHURCH_ROLE','CHURCH_CAPABILITY','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CONFIRMATION','FEEDBACK_CASE','FEEDBACK_IDEA','PHOTO_TAG_REQUEST','PHOTO_TAG_APPROVED','FRIEND_CONNECTED','EXCHANGE_MATCH','EXCHANGE_INQUIRY','EXCHANGE_HANDOFF','EXCHANGE_REMINDER') AND "postId" IS NULL AND "commentId" IS NULL)))
);


ALTER TABLE "RetentionHold" DROP CONSTRAINT "RetentionHold_message_report_only";
ALTER TABLE "RetentionHold" ADD CONSTRAINT "RetentionHold_message_report_only" CHECK (target::text IN ('MESSAGE','REPORT','EXCHANGE_INQUIRY'));
ALTER TABLE "RetentionPurge" DROP CONSTRAINT "RetentionPurge_message_report_only";
ALTER TABLE "RetentionPurge" ADD CONSTRAINT "RetentionPurge_message_report_only" CHECK (target::text IN ('MESSAGE','REPORT','EXCHANGE_INQUIRY'));
COMMIT;
