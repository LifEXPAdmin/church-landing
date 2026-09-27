-- AlterEnum
ALTER TYPE "ChurchCapability" ADD VALUE 'COMMIT_INTERCHURCH_HELP';

-- AlterTable
ALTER TABLE "ExchangeListing" ADD COLUMN     "helpPurpose" TEXT;

-- CreateTable
CREATE TABLE "InterchurchHelpRequest" (
    "id" TEXT NOT NULL,
    "listingId" TEXT,
    "schema" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "termsVersion" INTEGER NOT NULL DEFAULT 1,
    "recoveryRequired" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT NOT NULL,
    "duties" TEXT NOT NULL,
    "dutyClass" TEXT NOT NULL,
    "equipmentMode" TEXT NOT NULL,
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "compensation" TEXT NOT NULL,
    "amountMinor" INTEGER,
    "currency" TEXT,
    "rateUnit" TEXT,
    "reimbursement" TEXT NOT NULL,
    "coordinatorId" TEXT,
    "coordinatorKey" TEXT,
    "coordinatorDisplay" TEXT NOT NULL,
    "consentVersion" INTEGER NOT NULL DEFAULT 1,
    "outcome" TEXT NOT NULL DEFAULT 'OPEN',
    "outcomeReason" TEXT NOT NULL DEFAULT '',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterchurchHelpRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterchurchHelpOffer" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "responderId" TEXT,
    "coordinatorId" TEXT,
    "respondingChurchId" TEXT,
    "kind" TEXT NOT NULL,
    "schema" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "requestTermsVersion" INTEGER NOT NULL,
    "authorityKey" TEXT,
    "state" TEXT NOT NULL DEFAULT 'OFFERED',
    "terms" JSONB NOT NULL,
    "noticeSince" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "InterchurchHelpOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterchurchHelpAgreement" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "termsVersion" INTEGER NOT NULL DEFAULT 1,
    "requestTermsVersion" INTEGER NOT NULL,
    "offerVersion" INTEGER NOT NULL,
    "authorityKey" TEXT,
    "state" TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
    "terms" JSONB NOT NULL,
    "requesterAcknowledged" INTEGER,
    "responderAcknowledged" INTEGER,
    "requesterContact" TEXT NOT NULL DEFAULT '',
    "responderContact" TEXT NOT NULL DEFAULT '',
    "contactVersion" INTEGER NOT NULL DEFAULT 1,
    "requesterNoticeSince" TIMESTAMP(3),
    "responderNoticeSince" TIMESTAMP(3),
    "completionNote" TEXT NOT NULL DEFAULT '',
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterchurchHelpAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterchurchHelpEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorId" TEXT,
    "targetId" TEXT,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterchurchHelpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterchurchHelpRequest_listingId_key" ON "InterchurchHelpRequest"("listingId");

-- CreateIndex
CREATE INDEX "InterchurchHelpRequest_category_startAt_id_idx" ON "InterchurchHelpRequest"("category", "startAt", "id");

-- CreateIndex
CREATE INDEX "InterchurchHelpRequest_coordinatorId_updatedAt_id_idx" ON "InterchurchHelpRequest"("coordinatorId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "InterchurchHelpOffer_requestId_state_id_idx" ON "InterchurchHelpOffer"("requestId", "state", "id");

-- CreateIndex
CREATE INDEX "InterchurchHelpOffer_responderId_createdAt_id_idx" ON "InterchurchHelpOffer"("responderId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "InterchurchHelpOffer_coordinatorId_createdAt_id_idx" ON "InterchurchHelpOffer"("coordinatorId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InterchurchHelpAgreement_offerId_key" ON "InterchurchHelpAgreement"("offerId");

-- CreateIndex
CREATE INDEX "InterchurchHelpEvent_requestId_version_idx" ON "InterchurchHelpEvent"("requestId", "version");

-- AddForeignKey
ALTER TABLE "InterchurchHelpRequest" ADD CONSTRAINT "InterchurchHelpRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ExchangeListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterchurchHelpOffer" ADD CONSTRAINT "InterchurchHelpOffer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "InterchurchHelpRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterchurchHelpAgreement" ADD CONSTRAINT "InterchurchHelpAgreement_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "InterchurchHelpOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterchurchHelpEvent" ADD CONSTRAINT "InterchurchHelpEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "InterchurchHelpRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "ExchangeListing" DROP CONSTRAINT "ExchangeListing_shape";
ALTER TABLE "ExchangeListing" ADD CONSTRAINT "ExchangeListing_shape" CHECK (("helpPurpose" IS NULL AND (((version > 0) AND ("visibilityVersion" > 0) AND ("moderationVersion" >= 0) AND (((("ownerId" IS NOT NULL))::integer + (("ownerChurchId" IS NOT NULL))::integer) = 1) AND (length(title) <= 120) AND (length(description) <= 5000) AND (length("requestedItems") <= 2000) AND (length("serviceArea") <= 500) AND (length(availability) <= 1000) AND (length(qualifications) <= 2000) AND ((category IS NULL) OR (((intent)::text = 'SERVICE'::text) AND (category = ANY (ARRAY['HOME_GARDEN'::text, 'TECHNOLOGY_HELP'::text, 'CREATIVE_SKILLS'::text, 'LEARNING_HELP'::text, 'OTHER_SKILL'::text]))) OR (((intent)::text <> 'SERVICE'::text) AND (category = ANY (ARRAY['HOUSEHOLD'::text, 'FURNITURE'::text, 'CLOTHING'::text, 'BOOKS'::text, 'ELECTRONICS'::text, 'TOOLS'::text, 'HOBBIES'::text])))) AND ((condition IS NULL) OR (((intent)::text <> 'SERVICE'::text) AND (condition = ANY (ARRAY['NEW'::text, 'LIKE_NEW'::text, 'GOOD'::text, 'FAIR'::text, 'PARTS'::text])))) AND ((currency IS NULL) OR (currency = ANY (ARRAY['USD'::text, 'CAD'::text, 'EUR'::text, 'GBP'::text, 'AUD'::text, 'NZD'::text, 'JPY'::text, 'CHF'::text, 'SEK'::text, 'NOK'::text, 'DKK'::text, 'MXN'::text, 'BRL'::text, 'INR'::text, 'ZAR'::text, 'KWD'::text]))) AND (("priceMinor" IS NULL) OR ((currency IS NOT NULL) AND (("priceMinor" >= 1) AND ("priceMinor" <= 99999999)))) AND (((intent)::text = 'SALE'::text) OR (((intent)::text = 'SERVICE'::text) AND (COALESCE("servicePricing", ''::text) = 'FIXED'::text)) OR ((currency IS NULL) AND ("priceMinor" IS NULL))) AND (("neededBy" IS NULL) OR (("neededBy" ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'::text) AND ((("neededBy")::date)::text = "neededBy"))) AND (((intent)::text = ANY (ARRAY['WANTED'::text, 'CHURCH_NEED'::text])) OR (("requestedItems" = ''::text) AND ("neededBy" IS NULL))) AND (("servicePricing" IS NULL) OR ("servicePricing" = ANY (ARRAY['FREE'::text, 'FIXED'::text]))) AND (("serviceUnit" IS NULL) OR ((COALESCE("servicePricing", ''::text) = 'FIXED'::text) AND ("serviceUnit" = ANY (ARRAY['HOUR'::text, 'TASK'::text])))) AND (((intent)::text = 'SERVICE'::text) OR (("serviceArea" = ''::text) AND (availability = ''::text) AND (qualifications = ''::text) AND ("servicePricing" IS NULL) AND ("serviceUnit" IS NULL))) AND (((intent)::text <> 'CHURCH_NEED'::text) OR ("ownerChurchId" IS NOT NULL)) AND ((country IS NULL) OR (country ~ '^[A-Z]{2}$'::text)) AND (("placeId" IS NULL) OR ((country IS NOT NULL) AND (("placeId" >= 1) AND ("placeId" <= 100000000)) AND ("placeLabel" IS NOT NULL))) AND ((audience <> 'PUBLIC'::"PostAudience") OR ("audienceChurchId" IS NULL)) AND (("ownerChurchId" IS NULL) OR ("audienceChurchId" IS NULL) OR ("ownerChurchId" = "audienceChurchId")) AND ((state <> ALL (ARRAY['ACTIVE'::"ExchangeListingState", 'RESERVED'::"ExchangeListingState", 'CLOSED'::"ExchangeListingState"])) OR ((length(TRIM(BOTH FROM title)) >= 3) AND (length(TRIM(BOTH FROM description)) >= 1) AND (category IS NOT NULL) AND (((intent)::text <> ALL (ARRAY['FREE'::text, 'SALE'::text])) OR (condition IS NOT NULL)) AND (((intent)::text <> ALL (ARRAY['WANTED'::text, 'CHURCH_NEED'::text])) OR (length(TRIM(BOTH FROM "requestedItems")) >= 1)) AND (((intent)::text <> 'SERVICE'::text) OR ((length(TRIM(BOTH FROM "serviceArea")) >= 1) AND (length(TRIM(BOTH FROM availability)) >= 1) AND (length(TRIM(BOTH FROM qualifications)) >= 1) AND ("servicePricing" IS NOT NULL) AND (("servicePricing" <> 'FIXED'::text) OR ("serviceUnit" IS NOT NULL)))) AND ("placeId" IS NOT NULL) AND ("publishedAt" IS NOT NULL) AND ("confirmedAt" IS NOT NULL) AND ("itemPolicy" IS NOT NULL) AND (("itemPolicy" = ANY (ARRAY['exchange-listings-v2'::text, 'exchange-listings-v3'::text])) OR (((intent)::text = ANY (ARRAY['FREE'::text, 'SALE'::text])) AND ("itemPolicy" = 'ordinary-items-v1'::text))) AND ((((intent)::text <> 'SALE'::text) AND (NOT (((intent)::text = 'SERVICE'::text) AND (COALESCE("servicePricing", ''::text) = 'FIXED'::text)))) OR ((currency IS NOT NULL) AND ("priceMinor" IS NOT NULL))) AND ((audience <> 'CHURCH'::"PostAudience") OR ("audienceChurchId" IS NOT NULL)))) AND (("erasedAt" IS NULL) OR (state = 'ARCHIVED'::"ExchangeListingState"))))) OR ("helpPurpose" IS NOT NULL AND "helpPurpose"='INTERCHURCH_V1' AND intent='CHURCH_NEED' AND "ownerChurchId" IS NOT NULL AND "ownerId" IS NULL AND category IS NULL AND condition IS NULL AND currency IS NULL AND "priceMinor" IS NULL AND "requestedItems"='' AND "neededBy" IS NULL AND description='' AND "serviceArea"='' AND availability='' AND qualifications='' AND "servicePricing" IS NULL AND "serviceUnit" IS NULL AND NOT "inquiriesEnabled" AND length(title) BETWEEN 3 AND 120 AND version>0 AND "visibilityVersion">0 AND "moderationVersion">=0 AND ("erasedAt" IS NULL OR state='ARCHIVED') AND ((audience='PUBLIC' AND "audienceChurchId" IS NULL) OR (audience='CHURCH' AND "audienceChurchId" IS NOT NULL AND "audienceChurchId"="ownerChurchId")) AND (state='DRAFT' OR state='ARCHIVED' OR ("placeId" IS NOT NULL AND "publishedAt" IS NOT NULL AND "confirmedAt" IS NOT NULL AND "itemPolicy" IS NOT NULL))));

ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_kind_check";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_kind_check" CHECK ((kind = ANY (ARRAY['REPORT'::text, 'HOLD'::text, 'MODERATION_POST'::text, 'MODERATION_COMMENT'::text, 'MODERATION_GROUP'::text, 'MODERATION_TOPIC'::text, 'MODERATION_EXCHANGE'::text, 'GROUP_ACCESS'::text, 'TOPIC_ACCESS'::text, 'POST_DISCOVERY'::text, 'EXCHANGE_VISIBILITY'::text, 'EXCHANGE_FAVORITE'::text, 'EXCHANGE_SAVED_SEARCH'::text, 'EXCHANGE_NEED'::text, 'INTERCHURCH_HELP'::text, 'PANTRY_HUB'::text, 'EXCHANGE_INQUIRY'::text, 'EXCHANGE_CONTACT'::text, 'EXCHANGE_DEFAULTS'::text, 'DISCOVERY_PREFERENCES'::text, 'CALENDAR_LAYER'::text, 'FOLLOWING_LISTS'::text, 'NOTIFICATION_PREFERENCES'::text, 'AUTHOR_BELL'::text, 'ADMIN_SUPPORT'::text, 'ADMIN_REPORT'::text, 'ADMIN_CLAIM'::text, 'APPEAL'::text, 'ACCOUNT_STATE'::text, 'AUTHOR_WITHDRAW_POST'::text, 'AUTHOR_WITHDRAW_COMMENT'::text, 'SUPPORT_MESSAGE'::text, 'SUPPORT_ATTACHMENT'::text, 'FEEDBACK_PROMPT'::text, 'FEEDBACK_CHOICES'::text, 'FEEDBACK_IDEA'::text, 'FEEDBACK_SUBSCRIPTION'::text, 'FEEDBACK_REVIEW'::text, 'PHOTO_TAG'::text, 'PHOTO_TAG_PREFERENCES'::text, 'PROFILE_LOCATION'::text, 'PROFILE_MODULES'::text, 'VOLUNTEER_OPPORTUNITY'::text, 'VOLUNTEER_APPLICATION'::text])));

ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_account_scope";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_account_scope" CHECK ((((kind = ANY (ARRAY['ACCOUNT_STATE'::text, 'FEEDBACK_PROMPT'::text])) AND ((target)::text = 'ACCOUNT'::text) AND ("sourceId" = "targetId")) OR ((kind = ANY (ARRAY['GROUP_ACCESS'::text, 'TOPIC_ACCESS'::text, 'POST_DISCOVERY'::text, 'EXCHANGE_VISIBILITY'::text, 'EXCHANGE_FAVORITE'::text, 'EXCHANGE_SAVED_SEARCH'::text, 'EXCHANGE_NEED'::text, 'INTERCHURCH_HELP'::text, 'PANTRY_HUB'::text, 'EXCHANGE_INQUIRY'::text, 'EXCHANGE_CONTACT'::text, 'EXCHANGE_DEFAULTS'::text, 'DISCOVERY_PREFERENCES'::text, 'CALENDAR_LAYER'::text, 'FOLLOWING_LISTS'::text, 'NOTIFICATION_PREFERENCES'::text, 'AUTHOR_BELL'::text, 'ADMIN_SUPPORT'::text, 'ADMIN_REPORT'::text, 'ADMIN_CLAIM'::text, 'FEEDBACK_CHOICES'::text, 'FEEDBACK_IDEA'::text, 'FEEDBACK_SUBSCRIPTION'::text, 'FEEDBACK_REVIEW'::text, 'PHOTO_TAG'::text, 'PHOTO_TAG_PREFERENCES'::text, 'PROFILE_LOCATION'::text, 'PROFILE_MODULES'::text, 'VOLUNTEER_OPPORTUNITY'::text, 'VOLUNTEER_APPLICATION'::text])) AND ((target)::text = 'ACCOUNT'::text)) OR ((kind <> ALL (ARRAY['ACCOUNT_STATE'::text, 'FEEDBACK_PROMPT'::text, 'GROUP_ACCESS'::text, 'TOPIC_ACCESS'::text, 'POST_DISCOVERY'::text, 'EXCHANGE_VISIBILITY'::text, 'EXCHANGE_FAVORITE'::text, 'EXCHANGE_SAVED_SEARCH'::text, 'EXCHANGE_NEED'::text, 'INTERCHURCH_HELP'::text, 'PANTRY_HUB'::text, 'EXCHANGE_INQUIRY'::text, 'EXCHANGE_CONTACT'::text, 'EXCHANGE_DEFAULTS'::text, 'DISCOVERY_PREFERENCES'::text, 'CALENDAR_LAYER'::text, 'FOLLOWING_LISTS'::text, 'NOTIFICATION_PREFERENCES'::text, 'AUTHOR_BELL'::text, 'ADMIN_SUPPORT'::text, 'ADMIN_REPORT'::text, 'ADMIN_CLAIM'::text, 'FEEDBACK_CHOICES'::text, 'FEEDBACK_IDEA'::text, 'FEEDBACK_SUBSCRIPTION'::text, 'FEEDBACK_REVIEW'::text, 'PHOTO_TAG'::text, 'PHOTO_TAG_PREFERENCES'::text, 'PROFILE_LOCATION'::text, 'PROFILE_MODULES'::text, 'VOLUNTEER_OPPORTUNITY'::text, 'VOLUNTEER_APPLICATION'::text])) AND ((target)::text <> 'ACCOUNT'::text))));

ALTER TABLE "SocialEvent" DROP CONSTRAINT "SocialEvent_notification_source_check";
ALTER TABLE "SocialEvent" ADD CONSTRAINT "SocialEvent_notification_source_check" CHECK (((("sourceVersion" IS NULL) OR ("sourceVersion" > 0)) AND (("sourceId" IS NULL) OR ((length("sourceId") >= 1) AND (length("sourceId") <= 100))) AND (("notificationCategory" IS NULL) OR ("notificationCategory" = ANY (ARRAY['messages'::text, 'requests'::text, 'reports'::text, 'founder'::text, 'replies'::text, 'mentions'::text, 'conversations'::text, 'prayer'::text, 'posts'::text, 'reactions'::text, 'church'::text, 'commitments'::text, 'feedback'::text, 'photos'::text, 'exchange'::text, 'handoffs'::text, 'needs'::text, 'assistance'::text, 'groups'::text])))));

ALTER TABLE "SocialEvent" DROP CONSTRAINT "SocialEvent_source_shape";
ALTER TABLE "SocialEvent" ADD CONSTRAINT "SocialEvent_source_shape" CHECK ((((kind <> ALL (ARRAY['CALENDAR_REMINDER'::text, 'VOLUNTEER_REMINDER'::text, 'PUSH_TEST'::text, 'REPORT_RECEIVED'::text, 'REPORT_RECONSIDERATION'::text, 'CONTENT_DECISION'::text, 'AUTHOR_POST'::text, 'POST_MENTION'::text, 'POST_REACTION'::text, 'COMMENT_REACTION'::text, 'PRAYER_ACK'::text, 'CHURCH_REVIEW'::text, 'CHURCH_CONNECTION'::text, 'CHURCH_ROLE'::text, 'CHURCH_CAPABILITY'::text, 'EVENT_CHANGED'::text, 'RSVP_CHANGED'::text, 'VOLUNTEER_CHANGED'::text, 'VOLUNTEER_REQUEST'::text, 'VOLUNTEER_CONFIRMATION'::text, 'FEEDBACK_CASE'::text, 'FEEDBACK_IDEA'::text, 'PHOTO_TAG_REQUEST'::text, 'PHOTO_TAG_APPROVED'::text, 'FRIEND_CONNECTED'::text, 'EXCHANGE_MATCH'::text, 'EXCHANGE_INQUIRY'::text, 'EXCHANGE_HANDOFF'::text, 'EXCHANGE_REMINDER'::text, 'NEED_UPDATE'::text, 'NEED_CONTRIBUTION'::text, 'INTERCHURCH_HELP'::text, 'PANTRY_REQUEST'::text, 'GROUP_MEMBERSHIP'::text, 'GROUP_REVIEW'::text])) AND (kind !~~ 'ADULT_%'::text) AND ("postId" IS NOT NULL) AND ("commentId" IS NOT NULL) AND ("requestId" IS NULL) AND ("conversationId" IS NULL) AND ("messageId" IS NULL) AND ("reportId" IS NULL) AND ("decisionId" IS NULL)) OR ((kind = 'ADULT_REQUEST_CREATED'::text) AND ("postId" IS NULL) AND ("commentId" IS NULL) AND ("requestId" IS NOT NULL) AND ("conversationId" IS NULL) AND ("messageId" IS NULL) AND ("reportId" IS NULL) AND ("decisionId" IS NULL) AND ("recipientId" IS NOT NULL)) OR ((kind = 'ADULT_REQUEST_ACCEPTED'::text) AND ("postId" IS NULL) AND ("commentId" IS NULL) AND ("requestId" IS NOT NULL) AND ("conversationId" IS NOT NULL) AND ("messageId" IS NULL) AND ("reportId" IS NULL) AND ("decisionId" IS NULL) AND ("recipientId" IS NOT NULL)) OR ((kind = 'ADULT_MESSAGE_CREATED'::text) AND ("postId" IS NULL) AND ("commentId" IS NULL) AND ("requestId" IS NULL) AND ("conversationId" IS NOT NULL) AND ("messageId" IS NOT NULL) AND ("reportId" IS NULL) AND ("decisionId" IS NULL) AND ("recipientId" IS NOT NULL)) OR ((kind = ANY (ARRAY['REPORT_RECEIVED'::text, 'REPORT_RECONSIDERATION'::text])) AND ("postId" IS NULL) AND ("commentId" IS NULL) AND ("requestId" IS NULL) AND ("conversationId" IS NULL) AND ("messageId" IS NULL) AND ("reportId" IS NOT NULL) AND ("decisionId" IS NULL) AND ("recipientId" IS NOT NULL)) OR ((kind = 'CONTENT_DECISION'::text) AND ("postId" IS NULL) AND ("commentId" IS NULL) AND ("requestId" IS NULL) AND ("conversationId" IS NULL) AND ("messageId" IS NULL) AND ("reportId" IS NOT NULL) AND ("decisionId" IS NOT NULL) AND ("recipientId" IS NOT NULL)) OR ((kind = 'PUSH_TEST'::text) AND ("postId" IS NULL) AND ("commentId" IS NULL) AND ("requestId" IS NULL) AND ("conversationId" IS NULL) AND ("messageId" IS NULL) AND ("reportId" IS NULL) AND ("decisionId" IS NULL) AND ("recipientId" = "actorId") AND ("recipientId" IS NOT NULL)) OR ((kind = ANY (ARRAY['AUTHOR_POST'::text, 'POST_MENTION'::text, 'POST_REACTION'::text, 'COMMENT_REACTION'::text, 'PRAYER_ACK'::text, 'CHURCH_REVIEW'::text, 'CHURCH_CONNECTION'::text, 'CHURCH_ROLE'::text, 'CHURCH_CAPABILITY'::text, 'EVENT_CHANGED'::text, 'RSVP_CHANGED'::text, 'VOLUNTEER_CHANGED'::text, 'VOLUNTEER_REQUEST'::text, 'VOLUNTEER_CONFIRMATION'::text, 'FEEDBACK_CASE'::text, 'FEEDBACK_IDEA'::text, 'PHOTO_TAG_REQUEST'::text, 'PHOTO_TAG_APPROVED'::text, 'FRIEND_CONNECTED'::text, 'EXCHANGE_MATCH'::text, 'EXCHANGE_INQUIRY'::text, 'EXCHANGE_HANDOFF'::text, 'EXCHANGE_REMINDER'::text, 'NEED_UPDATE'::text, 'NEED_CONTRIBUTION'::text, 'INTERCHURCH_HELP'::text, 'PANTRY_REQUEST'::text, 'GROUP_MEMBERSHIP'::text, 'GROUP_REVIEW'::text])) AND ("recipientId" IS NOT NULL) AND ("sourceId" IS NOT NULL) AND ("sourceVersion" IS NOT NULL) AND ("notificationCategory" IS NOT NULL) AND ("requestId" IS NULL) AND ("conversationId" IS NULL) AND ("messageId" IS NULL) AND ("reportId" IS NULL) AND ("decisionId" IS NULL) AND (((kind = ANY (ARRAY['AUTHOR_POST'::text, 'POST_MENTION'::text, 'POST_REACTION'::text])) AND ("postId" IS NOT NULL) AND ("commentId" IS NULL)) OR ((kind = 'COMMENT_REACTION'::text) AND ("postId" IS NOT NULL) AND ("commentId" IS NOT NULL)) OR ((kind = 'PRAYER_ACK'::text) AND ("postId" IS NOT NULL)) OR ((kind = ANY (ARRAY['VOLUNTEER_CHANGED'::text, 'VOLUNTEER_REQUEST'::text])) AND ("postId" IS NOT NULL) AND ("commentId" IS NULL)) OR ((kind = ANY (ARRAY['CHURCH_REVIEW'::text, 'CHURCH_CONNECTION'::text, 'CHURCH_ROLE'::text, 'CHURCH_CAPABILITY'::text, 'EVENT_CHANGED'::text, 'RSVP_CHANGED'::text, 'VOLUNTEER_CONFIRMATION'::text, 'FEEDBACK_CASE'::text, 'FEEDBACK_IDEA'::text, 'PHOTO_TAG_REQUEST'::text, 'PHOTO_TAG_APPROVED'::text, 'FRIEND_CONNECTED'::text, 'EXCHANGE_MATCH'::text, 'EXCHANGE_INQUIRY'::text, 'EXCHANGE_HANDOFF'::text, 'EXCHANGE_REMINDER'::text, 'NEED_UPDATE'::text, 'NEED_CONTRIBUTION'::text, 'INTERCHURCH_HELP'::text, 'PANTRY_REQUEST'::text, 'GROUP_MEMBERSHIP'::text, 'GROUP_REVIEW'::text])) AND ("postId" IS NULL) AND ("commentId" IS NULL)))) OR ((kind = ANY (ARRAY['CALENDAR_REMINDER'::text, 'VOLUNTEER_REMINDER'::text])) AND ("recipientId" IS NOT NULL) AND ("recipientId" = "actorId") AND ("sourceId" IS NOT NULL) AND ("sourceVersion" IS NOT NULL) AND ("sourceVersion" > 0) AND ("notificationCategory" IS NOT NULL) AND ("notificationCategory" = 'commitments'::text) AND ("postId" IS NULL) AND ("commentId" IS NULL) AND ("requestId" IS NULL) AND ("conversationId" IS NULL) AND ("messageId" IS NULL) AND ("reportId" IS NULL) AND ("decisionId" IS NULL))));

-- Migration provisions no capability grant. The first real grant requires the
-- compatible rollback baseline and separate reviewed owner appointment.
CREATE UNIQUE INDEX "InterchurchHelpOffer_active_personal" ON "InterchurchHelpOffer" ("requestId", "responderId") WHERE kind='PERSONAL' AND state IN ('OFFERED','SELECTED') AND "authorityKey" IS NOT NULL;
CREATE UNIQUE INDEX "InterchurchHelpOffer_active_organization" ON "InterchurchHelpOffer" ("requestId", "responderId", "respondingChurchId") WHERE kind='ORGANIZATION' AND state IN ('OFFERED','SELECTED') AND "authorityKey" IS NOT NULL;
ALTER TABLE "InterchurchHelpRequest" ADD CONSTRAINT "InterchurchHelpRequest_shape" CHECK (schema=1 AND version>0 AND "termsVersion">0 AND "consentVersion">0 AND category IN ('PREACHING','WORSHIP','AV','CHILDREN','EQUIPMENT','TRANSPORT','OTHER') AND "dutyClass" IN ('ADULT_LOGISTICS','CHILD_FACING') AND "equipmentMode" IN ('NONE','WITH_OPERATOR','GIFT') AND "endAt">"startAt" AND length(duties) BETWEEN 3 AND 2000 AND length(reimbursement) BETWEEN 1 AND 500 AND ((compensation='VOLUNTARY' AND "amountMinor" IS NULL AND currency IS NULL AND "rateUnit" IS NULL) OR (compensation='PAID' AND "amountMinor" IS NOT NULL AND "amountMinor" BETWEEN 1 AND 99999999 AND currency IS NOT NULL AND "rateUnit" IN ('HOUR','TASK'))) AND outcome IN ('OPEN','CLOSED','CANCELED','PARTIAL','FULFILLED'));
ALTER TABLE "InterchurchHelpOffer" ADD CONSTRAINT "InterchurchHelpOffer_shape" CHECK (schema=1 AND version>0 AND ((kind='PERSONAL' AND "respondingChurchId" IS NULL) OR (kind='ORGANIZATION' AND "respondingChurchId" IS NOT NULL)) AND state IN ('OFFERED','SELECTED','WITHDRAWN','DECLINED','REVOKED') AND ("responderId" IS NULL OR "coordinatorId" IS NULL OR "responderId"<>"coordinatorId"));
ALTER TABLE "InterchurchHelpAgreement" ADD CONSTRAINT "InterchurchHelpAgreement_shape" CHECK (version>0 AND "termsVersion">0 AND "contactVersion">0 AND state IN ('NEEDS_REVIEW','CONFIRMED','COMPLETED','CANCELED','REVOKED') AND (state<>'CONFIRMED' OR ("requesterAcknowledged" IS NOT NULL AND "responderAcknowledged" IS NOT NULL AND "requesterAcknowledged"="termsVersion" AND "responderAcknowledged"="termsVersion")) AND length("requesterContact")<=250 AND length("responderContact")<=250);
CREATE FUNCTION interchurch_help_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='ExchangeListing' THEN
  IF NEW."helpPurpose" IS DISTINCT FROM OLD."helpPurpose" THEN RAISE EXCEPTION 'Listing purpose is immutable'; END IF;
  IF OLD."helpPurpose" IS NOT NULL AND current_setting('gc.interchurch_help_writer',true) IS DISTINCT FROM 'v1'
     AND (NEW.title,NEW.state,NEW.audience,NEW."audienceChurchId",NEW.country,NEW."placeId",NEW."placeLabel",NEW."ownerChurchId") IS DISTINCT FROM
         (OLD.title,OLD.state,OLD.audience,OLD."audienceChurchId",OLD.country,OLD."placeId",OLD."placeLabel",OLD."ownerChurchId")
     AND NOT (NEW.state='ARCHIVED' OR (NEW."recoveryRequired" AND NEW.state='DRAFT'))
  THEN RAISE EXCEPTION 'Typed help writer required'; END IF;
 ELSIF TG_TABLE_NAME='InterchurchHelpOffer' THEN
  IF NEW."requestId"<>OLD."requestId" OR NEW.kind<>OLD.kind OR NEW."respondingChurchId" IS DISTINCT FROM OLD."respondingChurchId" OR (NEW."responderId" IS NOT NULL AND NEW."responderId" IS DISTINCT FROM OLD."responderId") OR (NEW."coordinatorId" IS NOT NULL AND NEW."coordinatorId" IS DISTINCT FROM OLD."coordinatorId") THEN RAISE EXCEPTION 'Private help pair and representation are immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ExchangeListing_help_purpose" BEFORE UPDATE ON "ExchangeListing" FOR EACH ROW EXECUTE FUNCTION interchurch_help_binding();
CREATE TRIGGER "InterchurchHelpOffer_binding" BEFORE UPDATE ON "InterchurchHelpOffer" FOR EACH ROW EXECUTE FUNCTION interchurch_help_binding();
CREATE FUNCTION interchurch_help_shape() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE listing_id text;
BEGIN
 IF TG_OP='DELETE' THEN listing_id:=OLD."listingId";
 ELSIF TG_TABLE_NAME='ExchangeListing' THEN listing_id:=NEW.id; ELSE listing_id:=NEW."listingId"; END IF;
 IF listing_id IS NULL THEN RETURN NULL; END IF;
 IF EXISTS (SELECT 1 FROM "ExchangeListing" l WHERE l.id=listing_id AND ((l."helpPurpose"='INTERCHURCH_V1' AND (NOT EXISTS (SELECT 1 FROM "InterchurchHelpRequest" h WHERE h."listingId"=l.id AND h.schema=1) OR EXISTS (SELECT 1 FROM "ExchangeNeed" n WHERE n."listingId"=l.id))) OR (l."helpPurpose" IS NULL AND EXISTS (SELECT 1 FROM "InterchurchHelpRequest" h WHERE h."listingId"=l.id)))) THEN RAISE EXCEPTION 'Exclusive typed help request required'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "ExchangeListing_help_shape" AFTER INSERT OR UPDATE ON "ExchangeListing" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION interchurch_help_shape();
CREATE CONSTRAINT TRIGGER "ExchangeNeed_help_shape" AFTER INSERT OR UPDATE ON "ExchangeNeed" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION interchurch_help_shape();
CREATE CONSTRAINT TRIGGER "InterchurchHelpRequest_binding" AFTER INSERT OR UPDATE OR DELETE ON "InterchurchHelpRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION interchurch_help_shape();

ALTER TYPE "CommunityReportTarget" ADD VALUE 'INTERCHURCH_OFFER';
