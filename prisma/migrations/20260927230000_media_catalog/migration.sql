-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChurchCapability" ADD VALUE 'EDIT_CHURCH_MEDIA';
ALTER TYPE "ChurchCapability" ADD VALUE 'MANAGE_CHURCH_MEDIA';

-- CreateTable
CREATE TABLE "MediaCatalogItem" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "controlVersion" INTEGER NOT NULL DEFAULT 1,
    "ownerId" TEXT,
    "ownerChurchId" TEXT,
    "createdById" TEXT,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "audience" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "format" TEXT,
    "presentation" TEXT,
    "durationSeconds" INTEGER,
    "languageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "speakers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "churchCredit" TEXT NOT NULL DEFAULT '',
    "series" TEXT NOT NULL DEFAULT '',
    "sequence" INTEGER,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recordedOn" TEXT,
    "details" JSONB NOT NULL DEFAULT 'null',
    "sourceUrl" TEXT,
    "sourceProvider" TEXT,
    "sourceState" TEXT NOT NULL DEFAULT 'REVIEW_NEEDED',
    "acknowledgment" TEXT,
    "attribution" TEXT NOT NULL DEFAULT '',
    "moderationState" TEXT NOT NULL DEFAULT 'VISIBLE',
    "recoveryRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "MediaCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaCatalogRights" (
    "itemId" TEXT NOT NULL,
    "actorId" TEXT,
    "basis" TEXT NOT NULL,
    "evidenceReference" TEXT NOT NULL DEFAULT '',
    "license" TEXT NOT NULL DEFAULT '',
    "consentReference" TEXT NOT NULL DEFAULT '',
    "fingerprint" TEXT NOT NULL,
    "policy" TEXT NOT NULL,
    "assertedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "MediaCatalogRights_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "MediaCatalogEvent" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaCatalogEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaCatalogItem_state_audience_publishedAt_id_idx" ON "MediaCatalogItem"("state", "audience", "publishedAt", "id");

-- CreateIndex
CREATE INDEX "MediaCatalogItem_ownerId_state_updatedAt_idx" ON "MediaCatalogItem"("ownerId", "state", "updatedAt");

-- CreateIndex
CREATE INDEX "MediaCatalogItem_ownerChurchId_state_updatedAt_idx" ON "MediaCatalogItem"("ownerChurchId", "state", "updatedAt");

-- CreateIndex
CREATE INDEX "MediaCatalogEvent_itemId_createdAt_idx" ON "MediaCatalogEvent"("itemId", "createdAt");

-- AddForeignKey
ALTER TABLE "MediaCatalogItem" ADD CONSTRAINT "MediaCatalogItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaCatalogItem" ADD CONSTRAINT "MediaCatalogItem_ownerChurchId_fkey" FOREIGN KEY ("ownerChurchId") REFERENCES "Church"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaCatalogItem" ADD CONSTRAINT "MediaCatalogItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaCatalogRights" ADD CONSTRAINT "MediaCatalogRights_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MediaCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaCatalogRights" ADD CONSTRAINT "MediaCatalogRights_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaCatalogEvent" ADD CONSTRAINT "MediaCatalogEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MediaCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaCatalogEvent" ADD CONSTRAINT "MediaCatalogEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Incomplete drafts stay private; restored or erased tombstones may have no owner.
ALTER TABLE "MediaCatalogItem" ADD CONSTRAINT "media_owner" CHECK (
  ("ownerId" IS NOT NULL AND "ownerChurchId" IS NULL) OR
  ("ownerId" IS NULL AND "ownerChurchId" IS NOT NULL) OR
  ("ownerId" IS NULL AND "ownerChurchId" IS NULL AND ("removedAt" IS NOT NULL OR "recoveryRequired"))
), ADD CONSTRAINT "media_state" CHECK (state IN ('DRAFT','PUBLISHED','UNPUBLISHED','REMOVED')),
ADD CONSTRAINT "media_audience" CHECK (audience IS NULL OR audience IN ('PUBLIC','MEMBERS','CHURCH')),
ADD CONSTRAINT "media_format" CHECK (format IS NULL OR format IN ('SERMON','PODCAST','TESTIMONY','SERVICE','TEACHING')),
ADD CONSTRAINT "media_presentation" CHECK (presentation IS NULL OR presentation IN ('AUDIO','VIDEO')),
ADD CONSTRAINT "media_source_state" CHECK ("sourceState" IN ('REVIEW_NEEDED','ATTESTED','UNAVAILABLE')),
ADD CONSTRAINT "media_moderation" CHECK ("moderationState" IN ('VISIBLE','HIDDEN','REMOVED')),
ADD CONSTRAINT "media_bounds" CHECK (version>0 AND "controlVersion">0 AND length(title)<=160 AND length(description)<=5000
  AND cardinality("languageIds")<=5 AND cardinality(speakers)<=10 AND cardinality(topics)<=12
  AND ("durationSeconds" IS NULL OR "durationSeconds" BETWEEN 1 AND 604800)
  AND (sequence IS NULL OR sequence BETWEEN 1 AND 100000));
ALTER TABLE "MediaCatalogRights" ADD CONSTRAINT "media_rights_basis" CHECK (basis IN ('OWN','PERMISSION','LICENSE'));
-- Deterministic server-side search, filtered by current permission before pagination.
CREATE INDEX "MediaCatalogItem_topics_gin" ON "MediaCatalogItem" USING GIN (topics);

ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_account_scope";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_account_scope" CHECK ((((kind = ANY (ARRAY['ACCOUNT_STATE'::text, 'FEEDBACK_PROMPT'::text])) AND ((target)::text = 'ACCOUNT'::text) AND ("sourceId" = "targetId")) OR ((kind = ANY (ARRAY['GROUP_ACCESS'::text, 'TOPIC_ACCESS'::text, 'POST_DISCOVERY'::text, 'EXCHANGE_VISIBILITY'::text, 'EXCHANGE_FAVORITE'::text, 'EXCHANGE_SAVED_SEARCH'::text, 'EXCHANGE_NEED'::text, 'INTERCHURCH_HELP'::text, 'MEDIA_CATALOG'::text, 'PANTRY_HUB'::text, 'EXCHANGE_INQUIRY'::text, 'EXCHANGE_CONTACT'::text, 'EXCHANGE_DEFAULTS'::text, 'DISCOVERY_PREFERENCES'::text, 'CALENDAR_LAYER'::text, 'FOLLOWING_LISTS'::text, 'NOTIFICATION_PREFERENCES'::text, 'AUTHOR_BELL'::text, 'ADMIN_SUPPORT'::text, 'ADMIN_REPORT'::text, 'ADMIN_CLAIM'::text, 'FEEDBACK_CHOICES'::text, 'FEEDBACK_IDEA'::text, 'FEEDBACK_SUBSCRIPTION'::text, 'FEEDBACK_REVIEW'::text, 'PHOTO_TAG'::text, 'PHOTO_TAG_PREFERENCES'::text, 'PROFILE_LOCATION'::text, 'PROFILE_MODULES'::text, 'VOLUNTEER_OPPORTUNITY'::text, 'VOLUNTEER_APPLICATION'::text])) AND ((target)::text = 'ACCOUNT'::text)) OR ((kind <> ALL (ARRAY['ACCOUNT_STATE'::text, 'FEEDBACK_PROMPT'::text, 'GROUP_ACCESS'::text, 'TOPIC_ACCESS'::text, 'POST_DISCOVERY'::text, 'EXCHANGE_VISIBILITY'::text, 'EXCHANGE_FAVORITE'::text, 'EXCHANGE_SAVED_SEARCH'::text, 'EXCHANGE_NEED'::text, 'INTERCHURCH_HELP'::text, 'MEDIA_CATALOG'::text, 'PANTRY_HUB'::text, 'EXCHANGE_INQUIRY'::text, 'EXCHANGE_CONTACT'::text, 'EXCHANGE_DEFAULTS'::text, 'DISCOVERY_PREFERENCES'::text, 'CALENDAR_LAYER'::text, 'FOLLOWING_LISTS'::text, 'NOTIFICATION_PREFERENCES'::text, 'AUTHOR_BELL'::text, 'ADMIN_SUPPORT'::text, 'ADMIN_REPORT'::text, 'ADMIN_CLAIM'::text, 'FEEDBACK_CHOICES'::text, 'FEEDBACK_IDEA'::text, 'FEEDBACK_SUBSCRIPTION'::text, 'FEEDBACK_REVIEW'::text, 'PHOTO_TAG'::text, 'PHOTO_TAG_PREFERENCES'::text, 'PROFILE_LOCATION'::text, 'PROFILE_MODULES'::text, 'VOLUNTEER_OPPORTUNITY'::text, 'VOLUNTEER_APPLICATION'::text])) AND ((target)::text <> 'ACCOUNT'::text))));

ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_kind_check";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_kind_check" CHECK ((kind = ANY (ARRAY['REPORT'::text, 'HOLD'::text, 'MODERATION_POST'::text, 'MODERATION_COMMENT'::text, 'MODERATION_GROUP'::text, 'MODERATION_TOPIC'::text, 'MODERATION_EXCHANGE'::text, 'GROUP_ACCESS'::text, 'TOPIC_ACCESS'::text, 'POST_DISCOVERY'::text, 'EXCHANGE_VISIBILITY'::text, 'EXCHANGE_FAVORITE'::text, 'EXCHANGE_SAVED_SEARCH'::text, 'EXCHANGE_NEED'::text, 'INTERCHURCH_HELP'::text, 'MEDIA_CATALOG'::text, 'PANTRY_HUB'::text, 'EXCHANGE_INQUIRY'::text, 'EXCHANGE_CONTACT'::text, 'EXCHANGE_DEFAULTS'::text, 'DISCOVERY_PREFERENCES'::text, 'CALENDAR_LAYER'::text, 'FOLLOWING_LISTS'::text, 'NOTIFICATION_PREFERENCES'::text, 'AUTHOR_BELL'::text, 'ADMIN_SUPPORT'::text, 'ADMIN_REPORT'::text, 'ADMIN_CLAIM'::text, 'APPEAL'::text, 'ACCOUNT_STATE'::text, 'AUTHOR_WITHDRAW_POST'::text, 'AUTHOR_WITHDRAW_COMMENT'::text, 'SUPPORT_MESSAGE'::text, 'SUPPORT_ATTACHMENT'::text, 'FEEDBACK_PROMPT'::text, 'FEEDBACK_CHOICES'::text, 'FEEDBACK_IDEA'::text, 'FEEDBACK_SUBSCRIPTION'::text, 'FEEDBACK_REVIEW'::text, 'PHOTO_TAG'::text, 'PHOTO_TAG_PREFERENCES'::text, 'PROFILE_LOCATION'::text, 'PROFILE_MODULES'::text, 'VOLUNTEER_OPPORTUNITY'::text, 'VOLUNTEER_APPLICATION'::text])));
