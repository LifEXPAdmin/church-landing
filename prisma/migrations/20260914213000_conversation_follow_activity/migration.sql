BEGIN;
ALTER TABLE "ConversationPreference" ADD COLUMN "followedAt" TIMESTAMP(3);
UPDATE "ConversationPreference" SET "followedAt" = "updatedAt" WHERE "mode" = 'FOLLOW';
CREATE INDEX "ConversationPreference_postId_mode_id_idx" ON "ConversationPreference"("postId", "mode", "id");
ALTER TABLE "SocialPreferences" ADD COLUMN "conversationPushSince" TIMESTAMP(3);
CREATE TABLE "CommentFollowerJob" (
  "commentId" TEXT NOT NULL,
  "cursor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "dispatchedAt" TIMESTAMP(3),
  CONSTRAINT "CommentFollowerJob_pkey" PRIMARY KEY ("commentId"),
  CONSTRAINT "CommentFollowerJob_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "PlatformPostComment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CommentFollowerJob_completedAt_dispatchedAt_createdAt_idx" ON "CommentFollowerJob"("completedAt", "dispatchedAt", "createdAt");
ALTER TABLE "SocialPreferences" DROP CONSTRAINT notification_choices;
ALTER TABLE "SocialPreferences" ADD CONSTRAINT notification_choices CHECK (
  "pushCategories" <@ ARRAY['messages','requests','reports','founder','replies','mentions','conversations']::text[] AND
  (("quietStart" IS NULL AND "quietEnd" IS NULL AND "quietTimeZone" IS NULL) OR
   ("quietStart" IS NOT NULL AND "quietEnd" IS NOT NULL AND "quietTimeZone" IS NOT NULL AND
    "quietStart" BETWEEN 0 AND 1439 AND "quietEnd" BETWEEN 0 AND 1439 AND
    "quietStart" <> "quietEnd" AND char_length("quietTimeZone") BETWEEN 1 AND 100))
);
COMMIT;
