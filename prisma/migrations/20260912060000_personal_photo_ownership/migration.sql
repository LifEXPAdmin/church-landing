-- Add the enum value in its own committed statement before using it below.
ALTER TYPE "MediaPurpose" ADD VALUE 'PROFILE_PHOTO';
CREATE TYPE "PersonalPhotoAudience" AS ENUM ('ONLY_ME', 'MEMBERS', 'PUBLIC', 'CHURCH', 'SOURCE');
ALTER TABLE "MediaAsset" ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT true;
DROP INDEX "MediaAsset_one_profile_image";
CREATE UNIQUE INDEX "MediaAsset_one_profile_image" ON "MediaAsset" ("profileUserId", purpose)
  WHERE status = 'READY' AND "isCurrent" AND purpose IN ('PROFILE_AVATAR', 'PROFILE_COVER');
ALTER TABLE "MediaAsset" DROP CONSTRAINT "MediaAsset_target";
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_target" CHECK (
  (purpose::text IN ('PROFILE_AVATAR', 'PROFILE_COVER', 'PROFILE_PHOTO') AND "profileUserId" IS NOT NULL AND "churchId" IS NULL AND "postId" IS NULL)
  OR (purpose IN ('CHURCH_LOGO', 'CHURCH_COVER') AND "churchId" IS NOT NULL AND "profileUserId" IS NULL AND "postId" IS NULL)
  OR (purpose = 'POST_PHOTO' AND "postId" IS NOT NULL AND "profileUserId" IS NULL AND "churchId" IS NULL)
);
CREATE TABLE "PersonalPhoto" (
  "assetId" TEXT PRIMARY KEY REFERENCES "MediaAsset"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "ownerId" TEXT NOT NULL REFERENCES "PlatformUser"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  audience "PersonalPhotoAudience" NOT NULL,
  "audienceChurchId" TEXT REFERENCES "Church"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "hiddenAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "PersonalPhoto_audience" CHECK ((audience = 'CHURCH') = ("audienceChurchId" IS NOT NULL))
);
CREATE INDEX "PersonalPhoto_ownerId_deletedAt_createdAt_assetId_idx" ON "PersonalPhoto"("ownerId", "deletedAt", "createdAt", "assetId");
CREATE TABLE "PostPhotoReference" (
  "postId" TEXT NOT NULL REFERENCES "PlatformPost"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "assetId" TEXT NOT NULL REFERENCES "MediaAsset"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "ownerId" TEXT NOT NULL REFERENCES "PlatformUser"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0 AND position < 10),
  PRIMARY KEY ("postId", "assetId")
);
CREATE INDEX "PostPhotoReference_assetId_idx" ON "PostPhotoReference"("assetId");
-- Only current READY objects exist at upgrade. Retired bytes are never revived.
INSERT INTO "PersonalPhoto" ("assetId", "ownerId", "createdAt", "updatedAt", audience)
SELECT id, "profileUserId", "createdAt", CURRENT_TIMESTAMP, 'MEMBERS'
FROM "MediaAsset" WHERE status = 'READY' AND purpose IN ('PROFILE_AVATAR', 'PROFILE_COVER');
INSERT INTO "PersonalPhoto" ("assetId", "ownerId", "createdAt", "updatedAt", audience)
SELECT m.id, p."authorId", m."createdAt", CURRENT_TIMESTAMP, 'SOURCE'
FROM "MediaAsset" m JOIN "PlatformPost" p ON p.id = m."postId"
WHERE m.status = 'READY' AND m.purpose = 'POST_PHOTO' AND p."authorChurchId" IS NULL;
