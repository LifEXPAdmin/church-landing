-- References preserve attribution without copying source text or media.
CREATE TYPE "PostRepostKind" AS ENUM ('PLAIN', 'QUOTE');
ALTER TABLE "PlatformPost" ADD COLUMN "repostKind" "PostRepostKind", ADD COLUMN "repostSourceId" TEXT;
ALTER TABLE "PlatformPost" ADD CONSTRAINT "PlatformPost_repostSourceId_fkey" FOREIGN KEY ("repostSourceId") REFERENCES "PlatformPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlatformPost" ADD CONSTRAINT "PlatformPost_repost_shape" CHECK ("repostSourceId" IS NULL OR ("repostKind" IS NOT NULL AND "repostSourceId" <> "id"));
CREATE INDEX "PlatformPost_repostSourceId_idx" ON "PlatformPost"("repostSourceId");
-- One active plain repost for a public speaking identity and destination.
-- NULL destination means the personal/public destination, not a second key.
CREATE UNIQUE INDEX "PlatformPost_active_plain_repost" ON "PlatformPost" (
  (CASE WHEN "authorChurchId" IS NULL THEN 'person:' || "authorId" ELSE 'church:' || "authorChurchId" END),
  (COALESCE("audienceChurchId", '')),
  "repostSourceId"
) WHERE "repostKind" = 'PLAIN' AND "status" = 'PUBLISHED' AND "withdrawnAt" IS NULL;
