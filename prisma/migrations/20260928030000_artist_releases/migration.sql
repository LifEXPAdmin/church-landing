-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CommunityReportTarget" ADD VALUE 'ARTIST';
ALTER TYPE "CommunityReportTarget" ADD VALUE 'ARTIST_RELEASE';

-- DropForeignKey
ALTER TABLE "AdminAuthenticator" DROP CONSTRAINT "AdminAuthenticator_userId_fkey";

-- DropForeignKey
ALTER TABLE "PlatformMetricActivityDay" DROP CONSTRAINT "PlatformMetricActivityDay_version_fkey";

-- DropForeignKey
ALTER TABLE "PlatformMetricLifecycleDay" DROP CONSTRAINT "PlatformMetricLifecycleDay_version_fkey";

-- DropIndex
DROP INDEX "MediaCatalogItem_topics_gin";

-- AlterTable
ALTER TABLE "ChurchWelcomeThread" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CommunityReport" ALTER COLUMN "reviewDueAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + interval '30 days';

-- AlterTable
ALTER TABLE "FeedbackIdea" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "FeedbackIdeaEvent" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "FeedbackIdeaSubscription" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "FeedbackIdeaVote" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "FeedbackWeeklyReview" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "SocialRelationship" ADD COLUMN     "artistId" TEXT,
ADD COLUMN     "followingArtist" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ArtistProfile" (
    "id" TEXT NOT NULL,
    "stewardId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "controlVersion" INTEGER NOT NULL DEFAULT 1,
    "presentation" TEXT NOT NULL DEFAULT 'PERSON',
    "name" TEXT NOT NULL DEFAULT '',
    "biography" TEXT NOT NULL DEFAULT '',
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "countryId" TEXT,
    "townId" TEXT,
    "churchCredit" TEXT NOT NULL DEFAULT '',
    "credits" JSONB NOT NULL DEFAULT '[]',
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "moderationState" "ContentModerationState" NOT NULL DEFAULT 'VISIBLE',
    "recoveryRequired" BOOLEAN NOT NULL DEFAULT false,
    "fingerprint" TEXT,
    "rightsFingerprint" TEXT,
    "rightsPolicy" TEXT,
    "rightsBasis" TEXT,
    "rightsActorId" TEXT,
    "rightsAssertedAt" TIMESTAMP(3),
    "rightsExpiresAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ArtistProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtistRelease" (
    "id" TEXT NOT NULL,
    "artistId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "controlVersion" INTEGER NOT NULL DEFAULT 1,
    "kind" TEXT NOT NULL DEFAULT 'SINGLE',
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "releaseDate" TEXT,
    "tracks" JSONB NOT NULL DEFAULT '[]',
    "credits" JSONB NOT NULL DEFAULT '[]',
    "links" JSONB NOT NULL DEFAULT '[]',
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "moderationState" "ContentModerationState" NOT NULL DEFAULT 'VISIBLE',
    "recoveryRequired" BOOLEAN NOT NULL DEFAULT false,
    "fingerprint" TEXT,
    "rightsFingerprint" TEXT,
    "rightsPolicy" TEXT,
    "rightsBasis" TEXT,
    "rightsActorId" TEXT,
    "rightsAssertedAt" TIMESTAMP(3),
    "rightsExpiresAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ArtistRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtistDelegate" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "capabilities" TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtistDelegate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtistEventAssociation" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "proposedById" TEXT,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtistEventAssociation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtistAudit" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "actorId" TEXT,
    "resourceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtistAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArtistProfile_stewardId_state_updatedAt_idx" ON "ArtistProfile"("stewardId", "state", "updatedAt");

-- CreateIndex
CREATE INDEX "ArtistProfile_state_updatedAt_id_idx" ON "ArtistProfile"("state", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "ArtistRelease_artistId_state_updatedAt_idx" ON "ArtistRelease"("artistId", "state", "updatedAt");

-- CreateIndex
CREATE INDEX "ArtistDelegate_accountId_state_idx" ON "ArtistDelegate"("accountId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistDelegate_artistId_accountId_key" ON "ArtistDelegate"("artistId", "accountId");

-- CreateIndex
CREATE INDEX "ArtistEventAssociation_occurrenceId_revokedAt_idx" ON "ArtistEventAssociation"("occurrenceId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistEventAssociation_artistId_occurrenceId_key" ON "ArtistEventAssociation"("artistId", "occurrenceId");

-- CreateIndex
CREATE INDEX "ArtistAudit_artistId_createdAt_idx" ON "ArtistAudit"("artistId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialRelationship_ownerId_artistId_key" ON "SocialRelationship"("ownerId", "artistId");

-- AddForeignKey
ALTER TABLE "PlatformMetricLifecycleDay" ADD CONSTRAINT "PlatformMetricLifecycleDay_version_fkey" FOREIGN KEY ("version") REFERENCES "PlatformMetricConfiguration"("version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformMetricActivityDay" ADD CONSTRAINT "PlatformMetricActivityDay_version_fkey" FOREIGN KEY ("version") REFERENCES "PlatformMetricConfiguration"("version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuthenticator" ADD CONSTRAINT "AdminAuthenticator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialRelationship" ADD CONSTRAINT "SocialRelationship_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "ArtistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtistProfile" ADD CONSTRAINT "ArtistProfile_stewardId_fkey" FOREIGN KEY ("stewardId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtistRelease" ADD CONSTRAINT "ArtistRelease_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "ArtistProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtistDelegate" ADD CONSTRAINT "ArtistDelegate_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "ArtistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtistDelegate" ADD CONSTRAINT "ArtistDelegate_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtistEventAssociation" ADD CONSTRAINT "ArtistEventAssociation_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "ArtistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtistAudit" ADD CONSTRAINT "ArtistAudit_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "ArtistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_account_scope";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_account_scope" CHECK ((((kind = ANY (ARRAY['ACCOUNT_STATE'::text, 'FEEDBACK_PROMPT'::text])) AND ((target)::text = 'ACCOUNT'::text) AND ("sourceId" = "targetId")) OR ((kind = ANY (ARRAY['GROUP_ACCESS'::text, 'TOPIC_ACCESS'::text, 'POST_DISCOVERY'::text, 'EXCHANGE_VISIBILITY'::text, 'EXCHANGE_FAVORITE'::text, 'EXCHANGE_SAVED_SEARCH'::text, 'EXCHANGE_NEED'::text, 'INTERCHURCH_HELP'::text, 'ARTIST'::text, 'ARTIST_RELEASE'::text, 'ARTIST_FOLLOW'::text, 'MEDIA_CATALOG'::text, 'MEDIA_PLAYLIST'::text, 'MEDIA_SAVE'::text, 'PANTRY_HUB'::text, 'EXCHANGE_INQUIRY'::text, 'EXCHANGE_CONTACT'::text, 'EXCHANGE_DEFAULTS'::text, 'DISCOVERY_PREFERENCES'::text, 'CALENDAR_LAYER'::text, 'FOLLOWING_LISTS'::text, 'NOTIFICATION_PREFERENCES'::text, 'AUTHOR_BELL'::text, 'ADMIN_SUPPORT'::text, 'ADMIN_REPORT'::text, 'ADMIN_CLAIM'::text, 'FEEDBACK_CHOICES'::text, 'FEEDBACK_IDEA'::text, 'FEEDBACK_SUBSCRIPTION'::text, 'FEEDBACK_REVIEW'::text, 'PHOTO_TAG'::text, 'PHOTO_TAG_PREFERENCES'::text, 'PROFILE_LOCATION'::text, 'PROFILE_MODULES'::text, 'VOLUNTEER_OPPORTUNITY'::text, 'VOLUNTEER_APPLICATION'::text])) AND ((target)::text = 'ACCOUNT'::text)) OR ((kind <> ALL (ARRAY['ACCOUNT_STATE'::text, 'FEEDBACK_PROMPT'::text, 'GROUP_ACCESS'::text, 'TOPIC_ACCESS'::text, 'POST_DISCOVERY'::text, 'EXCHANGE_VISIBILITY'::text, 'EXCHANGE_FAVORITE'::text, 'EXCHANGE_SAVED_SEARCH'::text, 'EXCHANGE_NEED'::text, 'INTERCHURCH_HELP'::text, 'ARTIST'::text, 'ARTIST_RELEASE'::text, 'ARTIST_FOLLOW'::text, 'MEDIA_CATALOG'::text, 'MEDIA_PLAYLIST'::text, 'MEDIA_SAVE'::text, 'PANTRY_HUB'::text, 'EXCHANGE_INQUIRY'::text, 'EXCHANGE_CONTACT'::text, 'EXCHANGE_DEFAULTS'::text, 'DISCOVERY_PREFERENCES'::text, 'CALENDAR_LAYER'::text, 'FOLLOWING_LISTS'::text, 'NOTIFICATION_PREFERENCES'::text, 'AUTHOR_BELL'::text, 'ADMIN_SUPPORT'::text, 'ADMIN_REPORT'::text, 'ADMIN_CLAIM'::text, 'FEEDBACK_CHOICES'::text, 'FEEDBACK_IDEA'::text, 'FEEDBACK_SUBSCRIPTION'::text, 'FEEDBACK_REVIEW'::text, 'PHOTO_TAG'::text, 'PHOTO_TAG_PREFERENCES'::text, 'PROFILE_LOCATION'::text, 'PROFILE_MODULES'::text, 'VOLUNTEER_OPPORTUNITY'::text, 'VOLUNTEER_APPLICATION'::text])) AND ((target)::text <> 'ACCOUNT'::text))));

ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_kind_check";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_kind_check" CHECK ((kind = ANY (ARRAY['REPORT'::text, 'HOLD'::text, 'MODERATION_POST'::text, 'MODERATION_COMMENT'::text, 'MODERATION_GROUP'::text, 'MODERATION_TOPIC'::text, 'MODERATION_EXCHANGE'::text, 'GROUP_ACCESS'::text, 'TOPIC_ACCESS'::text, 'POST_DISCOVERY'::text, 'EXCHANGE_VISIBILITY'::text, 'EXCHANGE_FAVORITE'::text, 'EXCHANGE_SAVED_SEARCH'::text, 'EXCHANGE_NEED'::text, 'INTERCHURCH_HELP'::text, 'ARTIST'::text, 'ARTIST_RELEASE'::text, 'ARTIST_FOLLOW'::text, 'MEDIA_CATALOG'::text, 'MEDIA_PLAYLIST'::text, 'MEDIA_SAVE'::text, 'PANTRY_HUB'::text, 'EXCHANGE_INQUIRY'::text, 'EXCHANGE_CONTACT'::text, 'EXCHANGE_DEFAULTS'::text, 'DISCOVERY_PREFERENCES'::text, 'CALENDAR_LAYER'::text, 'FOLLOWING_LISTS'::text, 'NOTIFICATION_PREFERENCES'::text, 'AUTHOR_BELL'::text, 'ADMIN_SUPPORT'::text, 'ADMIN_REPORT'::text, 'ADMIN_CLAIM'::text, 'APPEAL'::text, 'ACCOUNT_STATE'::text, 'AUTHOR_WITHDRAW_POST'::text, 'AUTHOR_WITHDRAW_COMMENT'::text, 'SUPPORT_MESSAGE'::text, 'SUPPORT_ATTACHMENT'::text, 'FEEDBACK_PROMPT'::text, 'FEEDBACK_CHOICES'::text, 'FEEDBACK_IDEA'::text, 'FEEDBACK_SUBSCRIPTION'::text, 'FEEDBACK_REVIEW'::text, 'PHOTO_TAG'::text, 'PHOTO_TAG_PREFERENCES'::text, 'PROFILE_LOCATION'::text, 'PROFILE_MODULES'::text, 'VOLUNTEER_OPPORTUNITY'::text, 'VOLUNTEER_APPLICATION'::text])));

ALTER TABLE "SocialRelationship" DROP CONSTRAINT "SocialRelationship_target_shape";
ALTER TABLE "SocialRelationship" ADD CONSTRAINT "SocialRelationship_target_shape" CHECK (
 num_nonnulls("targetUserId", "churchId", "artistId")=1 AND ("targetUserId" IS NULL OR "targetUserId"<>"ownerId")
 AND (NOT blocked OR ("targetUserId" IS NOT NULL AND NOT favorite))
 AND ("churchId" IS NULL OR NOT favorite OR "followingChurch")
 AND ("targetUserId" IS NULL OR NOT "followingChurch")
 AND ("artistId" IS NULL OR (NOT "followingChurch" AND NOT favorite AND NOT muted AND "snoozedUntil" IS NULL AND NOT blocked AND "authorBellSince" IS NULL))
 AND ("artistId" IS NOT NULL OR NOT "followingArtist") AND version>0);
ALTER TABLE "ArtistProfile" ADD CONSTRAINT "ArtistProfile_shape" CHECK (version>0 AND "controlVersion">0 AND presentation IN ('PERSON','TEAM') AND state IN ('DRAFT','PUBLISHED','UNPUBLISHED','REMOVED') AND cardinality(roles)<=8 AND cardinality(genres)<=10 AND length(name)<=160 AND length(biography)<=5000 AND jsonb_typeof(credits)='array' AND jsonb_array_length(credits)<=30);
ALTER TABLE "ArtistRelease" ADD CONSTRAINT "ArtistRelease_shape" CHECK (version>0 AND "controlVersion">0 AND kind IN ('SINGLE','EP','ALBUM') AND state IN ('DRAFT','PUBLISHED','UNPUBLISHED','REMOVED') AND length(title)<=160 AND length(description)<=5000 AND jsonb_typeof(tracks)='array' AND jsonb_array_length(tracks)<=50 AND jsonb_typeof(credits)='array' AND jsonb_array_length(credits)<=30 AND jsonb_typeof(links)='array' AND jsonb_array_length(links)<=5);
ALTER TABLE "ArtistDelegate" ADD CONSTRAINT "ArtistDelegate_shape" CHECK (version>0 AND state IN ('PENDING','ACCEPTED','REVOKED') AND cardinality(capabilities) BETWEEN 1 AND 3 AND capabilities <@ ARRAY['EDIT_ARTIST_PROFILE','EDIT_ARTIST_RELEASES','PUBLISH_ARTIST_RELEASES']::text[]);
ALTER TABLE "ArtistEventAssociation" ADD CONSTRAINT "ArtistEventAssociation_shape" CHECK(version>0 AND (("acceptedAt" IS NULL AND "acceptedById" IS NULL) OR "acceptedAt" IS NOT NULL));
