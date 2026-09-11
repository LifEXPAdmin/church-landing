-- AlterTable
ALTER TABLE "PlatformPostComment" ADD COLUMN     "authorChurchId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "rootId" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "CommentLike" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommentLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentMention" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentPin" (
    "postId" TEXT NOT NULL,
    "commentId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CommentPin_pkey" PRIMARY KEY ("postId")
);

-- CreateTable
CREATE TABLE "ConversationPreference" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'DEFAULT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateCommentDraft" (
    "ownerId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "replyToId" TEXT,
    "authorChurchId" TEXT,
    "content" TEXT NOT NULL,
    "mentionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PrivateCommentDraft_pkey" PRIMARY KEY ("ownerId","id")
);

-- CreateTable
CREATE TABLE "SocialEvent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "recipientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPreferences" (
    "ownerId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "mentions" TEXT NOT NULL DEFAULT 'EVERYONE',
    "showRelationships" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPreferences_pkey" PRIMARY KEY ("ownerId")
);

-- CreateTable
CREATE TABLE "SocialRelationship" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "churchId" TEXT,
    "followingChurch" BOOLEAN NOT NULL DEFAULT false,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "snoozedUntil" TIMESTAMP(3),
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialOperation" (
    "ownerId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialOperation_pkey" PRIMARY KEY ("ownerId","key")
);

-- CreateIndex
CREATE INDEX "CommentLike_userId_idx" ON "CommentLike"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentLike_commentId_userId_key" ON "CommentLike"("commentId", "userId");

-- CreateIndex
CREATE INDEX "CommentMention_recipientId_idx" ON "CommentMention"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentMention_commentId_recipientId_key" ON "CommentMention"("commentId", "recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentPin_commentId_key" ON "CommentPin"("commentId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentPin_commentId_postId_key" ON "CommentPin"("commentId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationPreference_ownerId_postId_key" ON "ConversationPreference"("ownerId", "postId");

-- CreateIndex
CREATE INDEX "PrivateCommentDraft_ownerId_deletedAt_postId_replyToId_idx" ON "PrivateCommentDraft"("ownerId", "deletedAt", "postId", "replyToId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialEvent_key_key" ON "SocialEvent"("key");

-- CreateIndex
CREATE INDEX "SocialEvent_postId_createdAt_idx" ON "SocialEvent"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "SocialEvent_recipientId_createdAt_idx" ON "SocialEvent"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "SocialRelationship_targetUserId_blocked_idx" ON "SocialRelationship"("targetUserId", "blocked");

-- CreateIndex
CREATE INDEX "SocialRelationship_ownerId_blocked_idx" ON "SocialRelationship"("ownerId", "blocked");

-- CreateIndex
CREATE INDEX "SocialRelationship_ownerId_id_idx" ON "SocialRelationship"("ownerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SocialRelationship_ownerId_targetUserId_key" ON "SocialRelationship"("ownerId", "targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialRelationship_ownerId_churchId_key" ON "SocialRelationship"("ownerId", "churchId");

-- CreateIndex
CREATE INDEX "SocialOperation_ownerId_createdAt_idx" ON "SocialOperation"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformPostComment_postId_rootId_createdAt_id_idx" ON "PlatformPostComment"("postId", "rootId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPostComment_id_postId_key" ON "PlatformPostComment"("id", "postId");

-- AddForeignKey
ALTER TABLE "PlatformPostComment" ADD CONSTRAINT "PlatformPostComment_authorChurchId_fkey" FOREIGN KEY ("authorChurchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformPostComment" ADD CONSTRAINT "PlatformPostComment_parentId_postId_fkey" FOREIGN KEY ("parentId", "postId") REFERENCES "PlatformPostComment"("id", "postId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PlatformPostComment" ADD CONSTRAINT "PlatformPostComment_rootId_postId_fkey" FOREIGN KEY ("rootId", "postId") REFERENCES "PlatformPostComment"("id", "postId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "PlatformPostComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentMention" ADD CONSTRAINT "CommentMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "PlatformPostComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentMention" ADD CONSTRAINT "CommentMention_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentPin" ADD CONSTRAINT "CommentPin_postId_fkey" FOREIGN KEY ("postId") REFERENCES "PlatformPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentPin" ADD CONSTRAINT "CommentPin_commentId_postId_fkey" FOREIGN KEY ("commentId", "postId") REFERENCES "PlatformPostComment"("id", "postId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ConversationPreference" ADD CONSTRAINT "ConversationPreference_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationPreference" ADD CONSTRAINT "ConversationPreference_postId_fkey" FOREIGN KEY ("postId") REFERENCES "PlatformPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateCommentDraft" ADD CONSTRAINT "PrivateCommentDraft_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateCommentDraft" ADD CONSTRAINT "PrivateCommentDraft_postId_fkey" FOREIGN KEY ("postId") REFERENCES "PlatformPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPreferences" ADD CONSTRAINT "SocialPreferences_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialRelationship" ADD CONSTRAINT "SocialRelationship_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialRelationship" ADD CONSTRAINT "SocialRelationship_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialRelationship" ADD CONSTRAINT "SocialRelationship_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialOperation" ADD CONSTRAINT "SocialOperation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Preserve legacy comment IDs/content/timestamps and follow edges. New policy is
-- opt-in; these checks concern only newly added structural fields.
ALTER TABLE "SocialRelationship" ADD CONSTRAINT "SocialRelationship_target_shape" CHECK (
  num_nonnulls("targetUserId", "churchId") = 1
  AND ("targetUserId" IS NULL OR "targetUserId" <> "ownerId")
  AND (NOT blocked OR ("targetUserId" IS NOT NULL AND NOT favorite))
  AND ("churchId" IS NULL OR NOT favorite OR "followingChurch")
  AND ("targetUserId" IS NULL OR NOT "followingChurch")
  AND version > 0
);
ALTER TABLE "SocialPreferences" ADD CONSTRAINT "SocialPreferences_choices" CHECK (version > 0 AND mentions IN ('EVERYONE','FOLLOWED','NOBODY'));
ALTER TABLE "PlatformPostComment" ADD CONSTRAINT "PlatformPostComment_thread_shape" CHECK (
  version > 0 AND (("parentId" IS NULL AND "rootId" IS NULL) OR ("parentId" IS NOT NULL AND "rootId" IS NOT NULL AND id <> "parentId" AND id <> "rootId"))
  AND ("deletedAt" IS NULL OR content = '')
);
ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_version" CHECK (version > 0);
ALTER TABLE "CommentPin" ADD CONSTRAINT "CommentPin_version" CHECK (version > 0);
ALTER TABLE "ConversationPreference" ADD CONSTRAINT "ConversationPreference_choices" CHECK (version > 0 AND mode IN ('DEFAULT','FOLLOW','MUTE'));
ALTER TABLE "PrivateCommentDraft" ADD CONSTRAINT "PrivateCommentDraft_shape" CHECK (version > 0 AND cardinality("mentionIds") <= 5 AND ("deletedAt" IS NULL OR (content = '' AND cardinality("mentionIds") = 0)));
CREATE UNIQUE INDEX "PrivateCommentDraft_one_active_target" ON "PrivateCommentDraft" ("ownerId", "postId", COALESCE("replyToId", '')) WHERE "deletedAt" IS NULL;
CREATE FUNCTION comment_thread_shape() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_root text; root_root text; root_post text;
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD."parentId" IS DISTINCT FROM NEW."parentId" OR OLD."rootId" IS DISTINCT FROM NEW."rootId" OR OLD."postId" <> NEW."postId" OR OLD."authorId" <> NEW."authorId" OR OLD."authorChurchId" IS DISTINCT FROM NEW."authorChurchId") THEN
    RAISE EXCEPTION 'Comment identity and thread are immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW."rootId" IS NOT NULL THEN
    SELECT COALESCE("rootId", id) INTO parent_root FROM "PlatformPostComment" WHERE id = NEW."parentId" AND "postId" = NEW."postId";
    SELECT "rootId", "postId" INTO root_root, root_post FROM "PlatformPostComment" WHERE id = NEW."rootId";
    IF parent_root IS NULL OR parent_root <> NEW."rootId" OR root_post IS NULL OR root_post <> NEW."postId" OR root_root IS NOT NULL THEN
      RAISE EXCEPTION 'Comment parent must belong to its root and post' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PlatformPostComment_thread_shape_trigger" BEFORE INSERT OR UPDATE OF "parentId", "rootId", "postId", "authorId", "authorChurchId" ON "PlatformPostComment" FOR EACH ROW EXECUTE FUNCTION comment_thread_shape();
