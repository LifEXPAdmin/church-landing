-- CreateEnum
CREATE TYPE "TopicLifecycle" AS ENUM ('ACTIVE', 'ARCHIVED');

ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_kind_check";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_kind_check" CHECK (
  kind IN ('REPORT','HOLD','MODERATION_POST','MODERATION_COMMENT','MODERATION_TOPIC','APPEAL',
    'AUTHOR_WITHDRAW_POST','AUTHOR_WITHDRAW_COMMENT','ACCOUNT_STATE','TOPIC_ACCESS'));
ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_account_scope";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_account_scope" CHECK (
  (kind='ACCOUNT_STATE' AND target::text='ACCOUNT' AND "sourceId"="targetId")
  OR (kind='TOPIC_ACCESS' AND target::text='ACCOUNT')
  OR (kind NOT IN ('ACCOUNT_STATE','TOPIC_ACCESS') AND target::text<>'ACCOUNT'));

-- CreateEnum
CREATE TYPE "TopicOfferedRole" AS ENUM ('MODERATOR', 'OWNER');

-- AlterEnum
ALTER TYPE "CommunityReportTarget" ADD VALUE 'TOPIC';

-- AlterTable
ALTER TABLE "CommunityReport" ADD COLUMN     "scopeTopicId" TEXT;

-- AlterTable
ALTER TABLE "PlatformPost" ADD COLUMN     "topicCommunityId" TEXT;

-- AlterTable
ALTER TABLE "PlatformPostComment" ADD COLUMN     "topicCommunityId" TEXT;

-- CreateTable
CREATE TABLE "TopicCommunity" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rules" TEXT NOT NULL,
    "rulesVersion" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "securityVersion" INTEGER NOT NULL DEFAULT 1,
    "recoveryRequired" BOOLEAN NOT NULL DEFAULT false,
    "creatorId" TEXT,
    "ownerId" TEXT,
    "lifecycle" "TopicLifecycle" NOT NULL DEFAULT 'ACTIVE',
    "moderationState" "ContentModerationState" NOT NULL DEFAULT 'VISIBLE',

    CONSTRAINT "TopicCommunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicMembership" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "joined" BOOLEAN NOT NULL DEFAULT false,
    "following" BOOLEAN NOT NULL DEFAULT false,
    "rulesVersion" INTEGER NOT NULL DEFAULT 0,
    "moderator" BOOLEAN NOT NULL DEFAULT false,
    "restrictedAt" TIMESTAMP(3),
    "restrictionReason" TEXT,
    "pendingRole" "TopicOfferedRole",
    "invitedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TopicMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicAudit" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "fromState" TEXT,
    "toState" TEXT,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TopicCommunity_nameKey_key" ON "TopicCommunity"("nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "TopicCommunity_slug_key" ON "TopicCommunity"("slug");

-- CreateIndex
CREATE INDEX "TopicCommunity_lifecycle_moderationState_nameKey_id_idx" ON "TopicCommunity"("lifecycle", "moderationState", "nameKey", "id");

-- CreateIndex
CREATE INDEX "TopicCommunity_ownerId_lifecycle_idx" ON "TopicCommunity"("ownerId", "lifecycle");

-- CreateIndex
CREATE INDEX "TopicMembership_userId_joined_following_idx" ON "TopicMembership"("userId", "joined", "following");

-- CreateIndex
CREATE INDEX "TopicMembership_communityId_createdAt_id_idx" ON "TopicMembership"("communityId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TopicMembership_communityId_userId_key" ON "TopicMembership"("communityId", "userId");

-- CreateIndex
CREATE INDEX "TopicAudit_communityId_createdAt_id_idx" ON "TopicAudit"("communityId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "CommunityReport_scopeTopicId_status_createdAt_idx" ON "CommunityReport"("scopeTopicId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformPost_topicCommunityId_status_publishedAt_id_idx" ON "PlatformPost"("topicCommunityId", "status", "publishedAt" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_scopeTopicId_fkey" FOREIGN KEY ("scopeTopicId") REFERENCES "TopicCommunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicCommunity" ADD CONSTRAINT "TopicCommunity_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicCommunity" ADD CONSTRAINT "TopicCommunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicMembership" ADD CONSTRAINT "TopicMembership_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "TopicCommunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicMembership" ADD CONSTRAINT "TopicMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicAudit" ADD CONSTRAINT "TopicAudit_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "TopicCommunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformPost" ADD CONSTRAINT "PlatformPost_topicCommunityId_fkey" FOREIGN KEY ("topicCommunityId") REFERENCES "TopicCommunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformPost" ADD CONSTRAINT "PlatformPost_topicCommunityId_authorId_fkey" FOREIGN KEY ("topicCommunityId", "authorId") REFERENCES "TopicMembership"("communityId", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PlatformPostComment" ADD CONSTRAINT "PlatformPostComment_topicCommunityId_authorId_fkey" FOREIGN KEY ("topicCommunityId", "authorId") REFERENCES "TopicMembership"("communityId", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Topic destinations cannot be used to widen church or event audiences. Old
-- records remain outside this new scope. Author membership references persist
-- after leaving so restrictions cannot be evaded by leaving and rejoining.
ALTER TABLE "PlatformPost" ADD CONSTRAINT "PlatformPost_topic_scope_check" CHECK (
  "topicCommunityId" IS NULL OR (audience='PUBLIC' AND "replyAudience"='VIEWERS'
    AND "authorChurchId" IS NULL AND "audienceChurchId" IS NULL
    AND "eventOccurrenceId" IS NULL AND "repostKind" IS NULL AND "scheduleAt" IS NULL));
ALTER TABLE "PlatformPostComment" ADD CONSTRAINT "PlatformPostComment_topic_identity_check" CHECK (
  "topicCommunityId" IS NULL OR "authorChurchId" IS NULL);
ALTER TABLE "TopicCommunity" ADD CONSTRAINT "TopicCommunity_shape_check" CHECK (
  length(name) >= 3 AND length(name) <= 80 AND length(slug) >= 3 AND length(slug) <= 60
  AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND slug NOT IN ('following','new','manage')
  AND length(description) >= 3 AND length(description) <= 1000 AND length(rules) >= 3 AND length(rules) <= 4000
  AND version>0 AND "rulesVersion">0 AND "securityVersion">0
  AND (lifecycle='ARCHIVED' OR "ownerId" IS NOT NULL));
ALTER TABLE "TopicMembership" ADD CONSTRAINT "TopicMembership_shape_check" CHECK (
  version>0 AND "rulesVersion">=0 AND (("pendingRole" IS NULL)=("invitedById" IS NULL))
  AND ("restrictedAt" IS NULL OR (NOT moderator AND "pendingRole" IS NULL))
  AND (NOT moderator OR joined));
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_one_scope_check" CHECK (
  "scopeChurchId" IS NULL OR "scopeTopicId" IS NULL);

CREATE FUNCTION "enforceTopicCommentScope"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."topicCommunityId" IS DISTINCT FROM
    (SELECT "topicCommunityId" FROM "PlatformPost" WHERE id=NEW."postId") THEN
    RAISE EXCEPTION 'Comment topic must match its canonical post';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "PlatformPostComment_topic_scope" BEFORE INSERT OR UPDATE OF "postId", "topicCommunityId"
  ON "PlatformPostComment" FOR EACH ROW EXECUTE FUNCTION "enforceTopicCommentScope"();

CREATE FUNCTION "preservePostTopicScope"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."topicCommunityId" IS DISTINCT FROM OLD."topicCommunityId" THEN
    RAISE EXCEPTION 'A published post keeps its topic destination';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "PlatformPost_topic_immutable" BEFORE UPDATE OF "topicCommunityId"
  ON "PlatformPost" FOR EACH ROW EXECUTE FUNCTION "preservePostTopicScope"();
