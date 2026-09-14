ALTER TABLE "SocialPreferences" ADD COLUMN "feedMode" TEXT, ADD COLUMN "feedVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlatformPostLike" ADD COLUMN "firstLikedAt" TIMESTAMP(3);
-- Version-one active rows are known first Likes. Older rows existed before the
-- inactive/version lifecycle; their original date is likewise authoritative.
-- Ambiguous later rows stay null rather than inventing a historical Like date.
UPDATE "PlatformPostLike" SET "firstLikedAt" = "createdAt" WHERE "active" = true AND "version" = 1;
DO $$
DECLARE lifecycle_started TIMESTAMPTZ;
BEGIN
  IF to_regclass('"_prisma_migrations"') IS NOT NULL THEN
    SELECT "finished_at" INTO lifecycle_started FROM "_prisma_migrations"
      WHERE "migration_name" = '20260912200000_post_like_versions' AND "finished_at" IS NOT NULL
      ORDER BY "finished_at" DESC LIMIT 1;
    UPDATE "PlatformPostLike" SET "firstLikedAt" = "createdAt"
      WHERE "firstLikedAt" IS NULL AND "createdAt" < (lifecycle_started AT TIME ZONE 'UTC');
  END IF;
END $$;
CREATE INDEX "PlatformPostLike_firstLikedAt_postId_idx" ON "PlatformPostLike"("firstLikedAt", "postId") WHERE "active" = true;
CREATE TABLE "FeedSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "mode" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "postIds" TEXT[] NOT NULL
);
CREATE INDEX "FeedSnapshot_ownerId_createdAt_idx" ON "FeedSnapshot"("ownerId", "createdAt");
CREATE INDEX "FeedSnapshot_expiresAt_idx" ON "FeedSnapshot"("expiresAt");
