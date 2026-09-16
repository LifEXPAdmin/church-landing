-- CreateEnum
CREATE TYPE "ExchangeListingState" AS ENUM ('DRAFT', 'ACTIVE', 'RESERVED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExchangeListingIntent" AS ENUM ('FREE', 'SALE');

-- AlterEnum
ALTER TYPE "MediaPurpose" ADD VALUE 'EXCHANGE_PHOTO';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChurchCapability" ADD VALUE 'PUBLISH_EXCHANGE_LISTINGS';
ALTER TYPE "ChurchCapability" ADD VALUE 'MANAGE_EXCHANGE_LISTINGS';
ALTER TYPE "ChurchCapability" ADD VALUE 'MODERATE_EXCHANGE_LISTINGS';

-- AlterEnum
ALTER TYPE "CommunityReportTarget" ADD VALUE 'EXCHANGE_LISTING';

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "exchangeListingId" TEXT;

-- CreateTable
CREATE TABLE "ExchangeListing" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "visibilityVersion" INTEGER NOT NULL DEFAULT 1,
    "recoveryRequired" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT,
    "ownerChurchId" TEXT,
    "creatorId" TEXT,
    "state" "ExchangeListingState" NOT NULL DEFAULT 'DRAFT',
    "moderationState" "ContentModerationState" NOT NULL DEFAULT 'VISIBLE',
    "moderationVersion" INTEGER NOT NULL DEFAULT 0,
    "intent" "ExchangeListingIntent" NOT NULL DEFAULT 'FREE',
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT,
    "condition" TEXT,
    "currency" TEXT,
    "priceMinor" INTEGER,
    "country" TEXT,
    "placeId" INTEGER,
    "placeLabel" TEXT,
    "audience" "PostAudience" NOT NULL DEFAULT 'PUBLIC',
    "audienceChurchId" TEXT,
    "itemPolicy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "erasedAt" TIMESTAMP(3),

    CONSTRAINT "ExchangeListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeListingAudit" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeListingAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeListing_ownerId_updatedAt_id_idx" ON "ExchangeListing"("ownerId", "updatedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ExchangeListing_ownerChurchId_updatedAt_id_idx" ON "ExchangeListing"("ownerChurchId", "updatedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ExchangeListing_state_moderationState_publishedAt_id_idx" ON "ExchangeListing"("state", "moderationState", "publishedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ExchangeListing_audienceChurchId_state_publishedAt_idx" ON "ExchangeListing"("audienceChurchId", "state", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "ExchangeListing_country_placeId_state_publishedAt_idx" ON "ExchangeListing"("country", "placeId", "state", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "ExchangeListingAudit_listingId_createdAt_idx" ON "ExchangeListingAudit"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_exchangeListingId_status_position_idx" ON "MediaAsset"("exchangeListingId", "status", "position");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_exchangeListingId_fkey" FOREIGN KEY ("exchangeListingId") REFERENCES "ExchangeListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeListing" ADD CONSTRAINT "ExchangeListing_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeListing" ADD CONSTRAINT "ExchangeListing_ownerChurchId_fkey" FOREIGN KEY ("ownerChurchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeListing" ADD CONSTRAINT "ExchangeListing_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeListing" ADD CONSTRAINT "ExchangeListing_audienceChurchId_fkey" FOREIGN KEY ("audienceChurchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeListing" ADD CONSTRAINT "ExchangeListing_ownerId_audienceChurchId_fkey" FOREIGN KEY ("ownerId", "audienceChurchId") REFERENCES "ChurchConnection"("userId", "churchId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ExchangeListingAudit" ADD CONSTRAINT "ExchangeListingAudit_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ExchangeListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExchangeListing" ADD CONSTRAINT "ExchangeListing_shape" CHECK (
  version > 0 AND "visibilityVersion" > 0 AND "moderationVersion" >= 0
  AND (("ownerId" IS NOT NULL)::integer + ("ownerChurchId" IS NOT NULL)::integer = 1)
  AND length(title) <= 120 AND length(description) <= 5000
  AND (category IS NULL OR category IN ('HOUSEHOLD','FURNITURE','CLOTHING','BOOKS','ELECTRONICS','TOOLS','HOBBIES'))
  AND (condition IS NULL OR condition IN ('NEW','LIKE_NEW','GOOD','FAIR','PARTS'))
  AND (currency IS NULL OR currency IN ('USD','CAD','EUR','GBP','AUD','NZD','JPY','CHF','SEK','NOK','DKK','MXN','BRL','INR','ZAR','KWD'))
  AND ("priceMinor" IS NULL OR (currency IS NOT NULL AND "priceMinor" BETWEEN 1 AND 99999999))
  AND (intent <> 'FREE' OR (currency IS NULL AND "priceMinor" IS NULL))
  AND (country IS NULL OR country ~ '^[A-Z]{2}$')
  AND ("placeId" IS NULL OR (country IS NOT NULL AND "placeId" BETWEEN 1 AND 100000000 AND "placeLabel" IS NOT NULL))
  AND (audience <> 'PUBLIC' OR "audienceChurchId" IS NULL)
  AND ("ownerChurchId" IS NULL OR "audienceChurchId" IS NULL OR "ownerChurchId"="audienceChurchId")
  AND (state NOT IN ('ACTIVE','RESERVED','CLOSED') OR (
    length(trim(title)) >= 3 AND length(trim(description)) >= 1 AND category IS NOT NULL AND condition IS NOT NULL
    AND "placeId" IS NOT NULL AND "publishedAt" IS NOT NULL AND "confirmedAt" IS NOT NULL AND "itemPolicy"='ordinary-items-v1'
    AND (intent <> 'SALE' OR (currency IS NOT NULL AND "priceMinor" IS NOT NULL))
    AND (audience <> 'CHURCH' OR "audienceChurchId" IS NOT NULL)
  ))
  AND ("erasedAt" IS NULL OR state='ARCHIVED')
);
CREATE FUNCTION protect_exchange_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."ownerId" IS DISTINCT FROM OLD."ownerId" OR NEW."ownerChurchId" IS DISTINCT FROM OLD."ownerChurchId"
    OR (NEW."creatorId" IS DISTINCT FROM OLD."creatorId" AND NEW."creatorId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Listing ownership cannot be reassigned through an edit' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ExchangeListing_ownership" BEFORE UPDATE ON "ExchangeListing"
  FOR EACH ROW EXECUTE FUNCTION protect_exchange_ownership();

ALTER TABLE "MediaAsset" DROP CONSTRAINT "MediaAsset_target";
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_target" CHECK (
  ("exchangeListingId" IS NULL AND "feedbackOwnerId" IS NULL AND "feedbackCaseId" IS NULL AND (
    (purpose::text IN ('PROFILE_AVATAR','PROFILE_COVER','PROFILE_PHOTO') AND "profileUserId" IS NOT NULL AND "churchId" IS NULL AND "postId" IS NULL)
    OR (purpose::text IN ('CHURCH_LOGO','CHURCH_COVER') AND "churchId" IS NOT NULL AND "profileUserId" IS NULL AND "postId" IS NULL)
    OR (purpose::text='POST_PHOTO' AND "postId" IS NOT NULL AND "profileUserId" IS NULL AND "churchId" IS NULL)))
  OR (purpose::text='SUPPORT_ATTACHMENT' AND "feedbackOwnerId" IS NOT NULL AND "feedbackOwnerId"="uploaderId"
    AND "profileUserId" IS NULL AND "churchId" IS NULL AND "postId" IS NULL AND "exchangeListingId" IS NULL AND "replacesId" IS NULL AND crop IS NULL)
  OR (purpose::text='EXCHANGE_PHOTO' AND "exchangeListingId" IS NOT NULL AND "profileUserId" IS NULL
    AND "churchId" IS NULL AND "postId" IS NULL AND "feedbackOwnerId" IS NULL AND "feedbackCaseId" IS NULL AND crop IS NULL)
);
CREATE FUNCTION protect_exchange_photo_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD."exchangeListingId" IS NOT NULL OR NEW."exchangeListingId" IS NOT NULL)
    AND (NEW."exchangeListingId" IS DISTINCT FROM OLD."exchangeListingId" OR NEW.purpose IS DISTINCT FROM OLD.purpose) THEN
    RAISE EXCEPTION 'An Exchange photograph cannot move between sources' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "MediaAsset_exchange_binding" BEFORE UPDATE ON "MediaAsset"
  FOR EACH ROW EXECUTE FUNCTION protect_exchange_photo_binding();

ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_kind_check";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_kind_check" CHECK (
 kind IN ('REPORT','HOLD','MODERATION_POST','MODERATION_COMMENT','MODERATION_TOPIC','MODERATION_EXCHANGE',
 'TOPIC_ACCESS','POST_DISCOVERY','EXCHANGE_VISIBILITY','DISCOVERY_PREFERENCES','NOTIFICATION_PREFERENCES',
 'AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','APPEAL','ACCOUNT_STATE',
 'AUTHOR_WITHDRAW_POST','AUTHOR_WITHDRAW_COMMENT','SUPPORT_MESSAGE','SUPPORT_ATTACHMENT','FEEDBACK_PROMPT',
 'FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION','FEEDBACK_REVIEW','PHOTO_TAG','PHOTO_TAG_PREFERENCES','PROFILE_LOCATION'));
ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_account_scope";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_account_scope" CHECK (
 (kind IN ('ACCOUNT_STATE','FEEDBACK_PROMPT') AND target::text='ACCOUNT' AND "sourceId"="targetId")
 OR (kind IN ('TOPIC_ACCESS','POST_DISCOVERY','EXCHANGE_VISIBILITY','DISCOVERY_PREFERENCES','NOTIFICATION_PREFERENCES','AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION','FEEDBACK_REVIEW','PHOTO_TAG','PHOTO_TAG_PREFERENCES','PROFILE_LOCATION') AND target::text='ACCOUNT')
 OR (kind NOT IN ('ACCOUNT_STATE','FEEDBACK_PROMPT','TOPIC_ACCESS','POST_DISCOVERY','EXCHANGE_VISIBILITY','DISCOVERY_PREFERENCES','NOTIFICATION_PREFERENCES','AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION','FEEDBACK_REVIEW','PHOTO_TAG','PHOTO_TAG_PREFERENCES','PROFILE_LOCATION') AND target::text<>'ACCOUNT'));
