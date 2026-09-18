-- AlterEnum
ALTER TYPE "ChurchCapability" ADD VALUE 'MANAGE_CHURCH_GROUPS';

-- AlterEnum
ALTER TYPE "CommunityReportTarget" ADD VALUE 'GROUP';

-- AlterEnum
ALTER TYPE "PostAudience" ADD VALUE 'GROUP';

-- AlterTable
ALTER TABLE "CommunityReport" ADD COLUMN     "scopeGroupId" TEXT;

-- AlterTable
ALTER TABLE "PlatformPost" ADD COLUMN     "groupCategory" TEXT,
ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "groupPinnedAt" TIMESTAMP(3),
ADD COLUMN     "groupThreadKind" TEXT,
ADD COLUMN     "selectedAnswerId" TEXT;

-- AlterTable
ALTER TABLE "PlatformPostComment" ADD COLUMN     "groupId" TEXT;

-- AlterTable
ALTER TABLE "ConversationPreference" ADD COLUMN     "readCommentAt" TIMESTAMP(3),
ADD COLUMN     "readCommentId" TEXT,
ADD COLUMN     "readPostVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "readVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "GatherGroup" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "rules" TEXT NOT NULL,
    "rulesVersion" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "securityVersion" INTEGER NOT NULL DEFAULT 1,
    "recoveryRequired" BOOLEAN NOT NULL DEFAULT false,
    "kind" TEXT NOT NULL DEFAULT 'INTEREST',
    "discovery" TEXT NOT NULL DEFAULT 'LISTED',
    "joinPolicy" TEXT NOT NULL DEFAULT 'APPROVAL',
    "format" TEXT NOT NULL DEFAULT 'LOCAL',
    "area" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "lifecycle" "TopicLifecycle" NOT NULL DEFAULT 'ACTIVE',
    "moderationState" "ContentModerationState" NOT NULL DEFAULT 'VISIBLE',
    "creatorId" TEXT,
    "ownerId" TEXT,
    "churchId" TEXT,
    "ownerAuthorityKey" TEXT,

    CONSTRAINT "GatherGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatherGroupMembership" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "rulesVersion" INTEGER NOT NULL DEFAULT 0,
    "rosterVisible" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3),
    "leader" BOOLEAN NOT NULL DEFAULT false,
    "leaderAuthorityKey" TEXT,
    "invitedById" TEXT,
    "invitationExpiresAt" TIMESTAMP(3),
    "invitationContactVersion" INTEGER,
    "invitationAuthorityVersion" INTEGER,
    "pendingRole" TEXT,
    "offeredById" TEXT,
    "offerExpiresAt" TIMESTAMP(3),
    "offerGroupVersion" INTEGER,

    CONSTRAINT "GatherGroupMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatherGroupAudit" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "fromState" TEXT,
    "toState" TEXT,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GatherGroupAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatherGroupEventLink" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GatherGroupEventLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GatherGroup_slug_key" ON "GatherGroup"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "GatherGroup_nameKey_key" ON "GatherGroup"("nameKey");

-- CreateIndex
CREATE INDEX "GatherGroup_discovery_lifecycle_moderationState_nameKey_id_idx" ON "GatherGroup"("discovery", "lifecycle", "moderationState", "nameKey", "id");

-- CreateIndex
CREATE INDEX "GatherGroup_ownerId_lifecycle_idx" ON "GatherGroup"("ownerId", "lifecycle");

-- CreateIndex
CREATE INDEX "GatherGroup_churchId_lifecycle_idx" ON "GatherGroup"("churchId", "lifecycle");

-- CreateIndex
CREATE INDEX "GatherGroupMembership_userId_state_groupId_idx" ON "GatherGroupMembership"("userId", "state", "groupId");

-- CreateIndex
CREATE INDEX "GatherGroupMembership_groupId_state_createdAt_id_idx" ON "GatherGroupMembership"("groupId", "state", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GatherGroupMembership_groupId_userId_key" ON "GatherGroupMembership"("groupId", "userId");

-- CreateIndex
CREATE INDEX "GatherGroupAudit_groupId_createdAt_id_idx" ON "GatherGroupAudit"("groupId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "GatherGroupEventLink_groupId_active_createdAt_id_idx" ON "GatherGroupEventLink"("groupId", "active", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GatherGroupEventLink_groupId_occurrenceId_key" ON "GatherGroupEventLink"("groupId", "occurrenceId");

-- CreateIndex
CREATE INDEX "CommunityReport_scopeGroupId_status_createdAt_idx" ON "CommunityReport"("scopeGroupId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPost_selectedAnswerId_key" ON "PlatformPost"("selectedAnswerId");

-- CreateIndex
CREATE INDEX "PlatformPost_groupId_status_publishedAt_id_idx" ON "PlatformPost"("groupId", "status", "publishedAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPost_selectedAnswerId_id_key" ON "PlatformPost"("selectedAnswerId", "id");

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_scopeGroupId_fkey" FOREIGN KEY ("scopeGroupId") REFERENCES "GatherGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatherGroup" ADD CONSTRAINT "GatherGroup_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatherGroup" ADD CONSTRAINT "GatherGroup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatherGroup" ADD CONSTRAINT "GatherGroup_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatherGroupMembership" ADD CONSTRAINT "GatherGroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "GatherGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatherGroupMembership" ADD CONSTRAINT "GatherGroupMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatherGroupAudit" ADD CONSTRAINT "GatherGroupAudit_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "GatherGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatherGroupEventLink" ADD CONSTRAINT "GatherGroupEventLink_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "GatherGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatherGroupEventLink" ADD CONSTRAINT "GatherGroupEventLink_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "CalendarOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformPost" ADD CONSTRAINT "PlatformPost_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "GatherGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformPost" ADD CONSTRAINT "PlatformPost_groupId_authorId_fkey" FOREIGN KEY ("groupId", "authorId") REFERENCES "GatherGroupMembership"("groupId", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PlatformPost" ADD CONSTRAINT "PlatformPost_selectedAnswerId_id_fkey" FOREIGN KEY ("selectedAnswerId", "id") REFERENCES "PlatformPostComment"("id", "postId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PlatformPostComment" ADD CONSTRAINT "PlatformPostComment_groupId_authorId_fkey" FOREIGN KEY ("groupId", "authorId") REFERENCES "GatherGroupMembership"("groupId", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- No existing capability, membership, notification or audience is broadened.
ALTER TABLE "GatherGroup" ADD CONSTRAINT "GatherGroup_shape" CHECK (
  kind IN ('INTEREST','CHURCH_LIFE','MINISTRY_TEAM','PRIVATE_COHORT') AND
  discovery IN ('LISTED','UNLISTED') AND "joinPolicy" IN ('OPEN','APPROVAL','INVITE_ONLY') AND
  format IN ('LOCAL','ONLINE','HYBRID') AND
  (kind <> 'PRIVATE_COHORT' OR (discovery='UNLISTED' AND "joinPolicy"='INVITE_ONLY')) AND
  ((kind IN ('CHURCH_LIFE','MINISTRY_TEAM')) = ("churchId" IS NOT NULL)) AND
  ("churchId" IS NOT NULL OR "ownerAuthorityKey" IS NULL) AND
  "rulesVersion">0 AND version>0 AND "securityVersion">0
);
ALTER TABLE "GatherGroupMembership" ADD CONSTRAINT "GatherGroupMembership_shape" CHECK (
  state IN ('ACTIVE','PENDING','INVITED','LEFT','DECLINED','REJECTED','REMOVED','BANNED') AND
  ("pendingRole" IS NULL OR "pendingRole" IN ('LEADER','OWNER')) AND
  (NOT leader OR state='ACTIVE') AND
  (state<>'ACTIVE' OR ("rulesVersion">0 AND "joinedAt" IS NOT NULL)) AND
  ("pendingRole" IS NULL OR (state='ACTIVE' AND "offeredById" IS NOT NULL AND "offerExpiresAt" IS NOT NULL AND "offerGroupVersion" IS NOT NULL)) AND
  (state<>'INVITED' OR ("invitedById" IS NOT NULL AND "invitationExpiresAt" IS NOT NULL AND "invitationContactVersion" IS NOT NULL AND "invitationAuthorityVersion" IS NOT NULL)) AND version>0
);
ALTER TABLE "PlatformPost" ADD CONSTRAINT "PlatformPost_group_shape" CHECK (
  (audience::text='GROUP') = ("groupId" IS NOT NULL) AND
  ("groupId" IS NULL OR ("topicCommunityId" IS NULL AND "authorChurchId" IS NULL AND "audienceChurchId" IS NULL AND
    "eventOccurrenceId" IS NULL AND "replyAudience"='VIEWERS' AND NOT "allowReposts" AND
    "repostKind" IS NULL AND "repostSourceId" IS NULL AND "scheduleAt" IS NULL AND status<>'SCHEDULED' AND
    "groupThreadKind" IS NOT NULL AND "groupCategory" IS NOT NULL AND "groupThreadKind" IN ('DISCUSSION','QUESTION') AND "groupCategory" IN ('GENERAL','PRAYER','PLANNING','RESOURCES'))) AND
  ("groupId" IS NOT NULL OR ("groupThreadKind" IS NULL AND "groupCategory" IS NULL AND "groupPinnedAt" IS NULL AND "selectedAnswerId" IS NULL)) AND
  ("selectedAnswerId" IS NULL OR "groupThreadKind"='QUESTION')
);
ALTER TABLE "PlatformPostComment" ADD CONSTRAINT "PlatformPostComment_group_identity" CHECK ("groupId" IS NULL OR ("topicCommunityId" IS NULL AND "authorChurchId" IS NULL));
ALTER TABLE "ExchangeListing" ADD CONSTRAINT "ExchangeListing_supported_audience" CHECK (audience::text IN ('PUBLIC','CHURCH'));
ALTER TABLE "ExchangeDefaults" ADD CONSTRAINT "ExchangeDefaults_supported_audience" CHECK (audience::text IN ('PUBLIC','CHURCH'));
ALTER TABLE "ConversationPreference" ADD CONSTRAINT "ConversationPreference_read_shape" CHECK (
  "readPostVersion">=0 AND "readVersion">=0 AND (("readCommentAt" IS NULL) = ("readCommentId" IS NULL))
);
CREATE FUNCTION guard_gather_post_destination() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."groupId" IS DISTINCT FROM OLD."groupId" THEN
    RAISE EXCEPTION 'A group post destination cannot change';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PlatformPost_group_destination" BEFORE UPDATE OF "groupId" ON "PlatformPost"
FOR EACH ROW EXECUTE FUNCTION guard_gather_post_destination();
CREATE FUNCTION guard_gather_comment_destination() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."groupId" IS DISTINCT FROM (SELECT "groupId" FROM "PlatformPost" WHERE id=NEW."postId") THEN
    RAISE EXCEPTION 'A reply must retain its current group destination';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PlatformPostComment_group_destination" BEFORE INSERT OR UPDATE OF "postId","groupId" ON "PlatformPostComment"
FOR EACH ROW EXECUTE FUNCTION guard_gather_comment_destination();

ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_kind_check";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_kind_check" CHECK (
 kind IN ('REPORT','HOLD','MODERATION_POST','MODERATION_COMMENT','MODERATION_GROUP','MODERATION_TOPIC','MODERATION_EXCHANGE',
 'GROUP_ACCESS','TOPIC_ACCESS','POST_DISCOVERY','EXCHANGE_VISIBILITY','EXCHANGE_FAVORITE','EXCHANGE_SAVED_SEARCH','EXCHANGE_NEED','PANTRY_HUB','EXCHANGE_INQUIRY','EXCHANGE_CONTACT','EXCHANGE_DEFAULTS','DISCOVERY_PREFERENCES','FOLLOWING_LISTS','NOTIFICATION_PREFERENCES',
 'AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','APPEAL','ACCOUNT_STATE',
 'AUTHOR_WITHDRAW_POST','AUTHOR_WITHDRAW_COMMENT','SUPPORT_MESSAGE','SUPPORT_ATTACHMENT','FEEDBACK_PROMPT',
 'FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION','FEEDBACK_REVIEW','PHOTO_TAG','PHOTO_TAG_PREFERENCES','PROFILE_LOCATION'));
ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_account_scope";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_account_scope" CHECK (
 (kind IN ('ACCOUNT_STATE','FEEDBACK_PROMPT') AND target::text='ACCOUNT' AND "sourceId"="targetId")
 OR (kind IN ('GROUP_ACCESS','TOPIC_ACCESS','POST_DISCOVERY','EXCHANGE_VISIBILITY','EXCHANGE_FAVORITE','EXCHANGE_SAVED_SEARCH','EXCHANGE_NEED','PANTRY_HUB','EXCHANGE_INQUIRY','EXCHANGE_CONTACT','EXCHANGE_DEFAULTS','DISCOVERY_PREFERENCES','FOLLOWING_LISTS','NOTIFICATION_PREFERENCES','AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION','FEEDBACK_REVIEW','PHOTO_TAG','PHOTO_TAG_PREFERENCES','PROFILE_LOCATION') AND target::text='ACCOUNT')
 OR (kind NOT IN ('ACCOUNT_STATE','FEEDBACK_PROMPT','GROUP_ACCESS','TOPIC_ACCESS','POST_DISCOVERY','EXCHANGE_VISIBILITY','EXCHANGE_FAVORITE','EXCHANGE_SAVED_SEARCH','EXCHANGE_NEED','PANTRY_HUB','EXCHANGE_INQUIRY','EXCHANGE_CONTACT','EXCHANGE_DEFAULTS','DISCOVERY_PREFERENCES','FOLLOWING_LISTS','NOTIFICATION_PREFERENCES','AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION','FEEDBACK_REVIEW','PHOTO_TAG','PHOTO_TAG_PREFERENCES','PROFILE_LOCATION') AND target::text<>'ACCOUNT'));



ALTER TABLE "PrivatePostDraft" ADD COLUMN "groupId" TEXT;
ALTER TABLE "PrivatePostDraft" ADD CONSTRAINT "PrivatePostDraft_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "GatherGroup"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrivatePostDraft" ADD CONSTRAINT "PrivatePostDraft_group_payload" CHECK (
  "deletedAt" IS NOT NULL OR
  (("groupId" IS NULL AND coalesce(payload->>'groupId','')='' AND coalesce(payload->>'audience','PUBLIC')<>'GROUP') OR
   ("groupId" IS NOT NULL AND payload->>'groupId' IS NOT NULL AND payload->>'groupId'="groupId" AND payload->>'audience'='GROUP'))
);
CREATE FUNCTION guard_gather_draft_destination() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."groupId" IS DISTINCT FROM OLD."groupId" THEN RAISE EXCEPTION 'A saved group draft retains its destination'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PrivatePostDraft_group_destination" BEFORE UPDATE OF "groupId" ON "PrivatePostDraft" FOR EACH ROW EXECUTE FUNCTION guard_gather_draft_destination();

ALTER TABLE "ConversationPreference" ADD COLUMN "readCommentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::text[];
ALTER TABLE "ConversationPreference" ADD COLUMN "readScope" TEXT;
ALTER TABLE "ConversationPreference" ADD CONSTRAINT "ConversationPreference_read_bounds" CHECK (cardinality("readCommentIds") <= 500);
