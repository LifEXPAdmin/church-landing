-- CreateEnum
CREATE TYPE "MediaPurpose" AS ENUM ('PROFILE_AVATAR', 'PROFILE_COVER', 'CHURCH_LOGO', 'CHURCH_COVER', 'POST_PHOTO');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('UPLOADING', 'READY', 'RETIRED');

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "purpose" "MediaPurpose" NOT NULL,
    "profileUserId" TEXT,
    "churchId" TEXT,
    "postId" TEXT,
    "status" "MediaStatus" NOT NULL DEFAULT 'UPLOADING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "storagePrefix" TEXT NOT NULL,
    "leaseUntil" TIMESTAMP(3) NOT NULL,
    "replacesId" TEXT,
    "caption" TEXT NOT NULL DEFAULT '',
    "alt" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "variants" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaGarbage" (
    "storagePrefix" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaGarbage_pkey" PRIMARY KEY ("storagePrefix")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storagePrefix_key" ON "MediaAsset"("storagePrefix");

-- CreateIndex
CREATE INDEX "MediaAsset_profileUserId_purpose_status_idx" ON "MediaAsset"("profileUserId", "purpose", "status");

-- CreateIndex
CREATE INDEX "MediaAsset_churchId_purpose_status_idx" ON "MediaAsset"("churchId", "purpose", "status");

-- CreateIndex
CREATE INDEX "MediaAsset_postId_status_position_idx" ON "MediaAsset"("postId", "status", "position");

-- CreateIndex
CREATE INDEX "MediaAsset_status_leaseUntil_idx" ON "MediaAsset"("status", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_uploaderId_requestKey_key" ON "MediaAsset"("uploaderId", "requestKey");

-- CreateIndex
CREATE INDEX "MediaGarbage_dueAt_idx" ON "MediaGarbage"("dueAt");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_profileUserId_fkey" FOREIGN KEY ("profileUserId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_postId_fkey" FOREIGN KEY ("postId") REFERENCES "PlatformPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_target" CHECK (
  (purpose IN ('PROFILE_AVATAR', 'PROFILE_COVER') AND "profileUserId" IS NOT NULL AND "churchId" IS NULL AND "postId" IS NULL)
  OR (purpose IN ('CHURCH_LOGO', 'CHURCH_COVER') AND "churchId" IS NOT NULL AND "profileUserId" IS NULL AND "postId" IS NULL)
  OR (purpose = 'POST_PHOTO' AND "postId" IS NOT NULL AND "profileUserId" IS NULL AND "churchId" IS NULL)
);
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_limits" CHECK (
  version > 0 AND position >= 0 AND char_length(caption) <= 500 AND char_length(alt) <= 300
);
CREATE UNIQUE INDEX "MediaAsset_one_profile_image" ON "MediaAsset" ("profileUserId", purpose) WHERE status = 'READY' AND "profileUserId" IS NOT NULL;
CREATE UNIQUE INDEX "MediaAsset_one_church_image" ON "MediaAsset" ("churchId", purpose) WHERE status = 'READY' AND "churchId" IS NOT NULL;
