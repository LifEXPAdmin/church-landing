-- Additive prayer records; no historical acknowledgments or subscriptions.
BEGIN;
-- AlterTable
ALTER TABLE "CommentFollowerJob" ADD COLUMN     "phase" TEXT NOT NULL DEFAULT 'CONVERSATIONS';

-- AlterTable
ALTER TABLE "SocialPreferences" ADD COLUMN     "prayerPushSince" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PrayerGuideReceipt" (
    "ownerId" TEXT NOT NULL,
    "guideVersion" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrayerGuideReceipt_pkey" PRIMARY KEY ("ownerId")
);

-- CreateTable
CREATE TABLE "PrayerRecord" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "commentId" TEXT,
    "targetKey" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "shareName" BOOLEAN NOT NULL DEFAULT false,
    "savedAt" TIMESTAMP(3),
    "updatesSince" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrayerRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrayerUpdate" (
    "commentId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "targetCommentId" TEXT,
    "targetKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrayerUpdate_pkey" PRIMARY KEY ("commentId")
);

-- CreateIndex
CREATE INDEX "PrayerRecord_ownerId_savedAt_id_idx" ON "PrayerRecord"("ownerId", "savedAt", "id");

-- CreateIndex
CREATE INDEX "PrayerRecord_targetKey_acknowledgedAt_idx" ON "PrayerRecord"("targetKey", "acknowledgedAt");

-- CreateIndex
CREATE INDEX "PrayerRecord_targetKey_id_idx" ON "PrayerRecord"("targetKey", "id");

-- CreateIndex
CREATE INDEX "PrayerRecord_commentId_postId_idx" ON "PrayerRecord"("commentId", "postId");

-- CreateIndex
CREATE INDEX "PrayerRecord_postId_idx" ON "PrayerRecord"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "PrayerRecord_ownerId_targetKey_key" ON "PrayerRecord"("ownerId", "targetKey");

-- CreateIndex
CREATE INDEX "PrayerUpdate_targetKey_createdAt_commentId_idx" ON "PrayerUpdate"("targetKey", "createdAt", "commentId");

-- CreateIndex
CREATE INDEX "PrayerUpdate_targetCommentId_postId_idx" ON "PrayerUpdate"("targetCommentId", "postId");

-- CreateIndex
CREATE INDEX "PrayerUpdate_postId_idx" ON "PrayerUpdate"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "PrayerUpdate_commentId_postId_key" ON "PrayerUpdate"("commentId", "postId");

-- AddForeignKey
ALTER TABLE "PrayerGuideReceipt" ADD CONSTRAINT "PrayerGuideReceipt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrayerRecord" ADD CONSTRAINT "PrayerRecord_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrayerRecord" ADD CONSTRAINT "PrayerRecord_postId_fkey" FOREIGN KEY ("postId") REFERENCES "PlatformPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrayerRecord" ADD CONSTRAINT "PrayerRecord_commentId_postId_fkey" FOREIGN KEY ("commentId", "postId") REFERENCES "PlatformPostComment"("id", "postId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrayerUpdate" ADD CONSTRAINT "PrayerUpdate_commentId_postId_fkey" FOREIGN KEY ("commentId", "postId") REFERENCES "PlatformPostComment"("id", "postId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrayerUpdate" ADD CONSTRAINT "PrayerUpdate_postId_fkey" FOREIGN KEY ("postId") REFERENCES "PlatformPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrayerUpdate" ADD CONSTRAINT "PrayerUpdate_targetCommentId_postId_fkey" FOREIGN KEY ("targetCommentId", "postId") REFERENCES "PlatformPostComment"("id", "postId") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "CommentFollowerJob" ADD CONSTRAINT "CommentFollowerJob_phase_check" CHECK (phase IN ('CONVERSATIONS', 'PRAYER'));
ALTER TABLE "PrayerGuideReceipt" ADD CONSTRAINT "PrayerGuideReceipt_version_check" CHECK (version > 0 AND char_length("guideVersion") BETWEEN 1 AND 80);
ALTER TABLE "PrayerRecord" ADD CONSTRAINT "PrayerRecord_choices_check" CHECK (
  version > 0 AND (NOT "shareName" OR "acknowledgedAt" IS NOT NULL) AND
  ("updatesSince" IS NULL OR "savedAt" IS NOT NULL) AND
  "targetKey" = CASE WHEN "commentId" IS NULL THEN 'post:' || "postId" ELSE 'comment:' || "commentId" END
);
ALTER TABLE "PrayerUpdate" ADD CONSTRAINT "PrayerUpdate_target_check" CHECK (
  kind IN ('REQUESTING', 'UPDATE', 'PRAISE', 'RESOLVED') AND
  ("targetCommentId" IS NULL OR "targetCommentId" <> "commentId") AND
  "targetKey" = CASE WHEN "targetCommentId" IS NULL THEN 'post:' || "postId" ELSE 'comment:' || "targetCommentId" END
);
ALTER TABLE "SocialPreferences" DROP CONSTRAINT notification_choices;
ALTER TABLE "SocialPreferences" ADD CONSTRAINT notification_choices CHECK (
  "pushCategories" <@ ARRAY['messages','requests','reports','founder','replies','mentions','conversations','prayer']::text[] AND
  (("quietStart" IS NULL AND "quietEnd" IS NULL AND "quietTimeZone" IS NULL) OR
   ("quietStart" IS NOT NULL AND "quietEnd" IS NOT NULL AND "quietTimeZone" IS NOT NULL AND
    "quietStart" BETWEEN 0 AND 1439 AND "quietEnd" BETWEEN 0 AND 1439 AND
    "quietStart" <> "quietEnd" AND char_length("quietTimeZone") BETWEEN 1 AND 100))
);
COMMIT;
