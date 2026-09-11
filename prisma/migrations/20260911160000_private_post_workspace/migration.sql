-- CreateTable
CREATE TABLE "PrivatePostDraft" (
    "publicationKey" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "publishedPostId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivatePostDraft_pkey" PRIMARY KEY ("ownerId","id")
);

-- CreateTable
CREATE TABLE "SavedPostCollection" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedPostCollection_pkey" PRIMARY KEY ("ownerId","id")
);

-- CreateTable
CREATE TABLE "SavedPostItem" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "postId" TEXT,
    "collectionId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedPostItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostWorkspaceOperation" (
    "ownerId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostWorkspaceOperation_pkey" PRIMARY KEY ("ownerId","key")
);

-- CreateIndex
CREATE INDEX "PrivatePostDraft_ownerId_deletedAt_id_idx" ON "PrivatePostDraft"("ownerId", "deletedAt", "id");

-- CreateIndex
CREATE INDEX "SavedPostCollection_ownerId_deletedAt_id_idx" ON "SavedPostCollection"("ownerId", "deletedAt", "id");

-- CreateIndex
CREATE INDEX "SavedPostItem_ownerId_collectionId_id_idx" ON "SavedPostItem"("ownerId", "collectionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SavedPostItem_ownerId_postId_key" ON "SavedPostItem"("ownerId", "postId");

-- AddForeignKey
ALTER TABLE "PrivatePostDraft" ADD CONSTRAINT "PrivatePostDraft_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPostCollection" ADD CONSTRAINT "SavedPostCollection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPostItem" ADD CONSTRAINT "SavedPostItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPostItem" ADD CONSTRAINT "SavedPostItem_postId_fkey" FOREIGN KEY ("postId") REFERENCES "PlatformPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPostItem" ADD CONSTRAINT "SavedPostItem_ownerId_collectionId_fkey" FOREIGN KEY ("ownerId", "collectionId") REFERENCES "SavedPostCollection"("ownerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostWorkspaceOperation" ADD CONSTRAINT "PostWorkspaceOperation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Versions and tombstones remain valid even across direct maintenance writes.
ALTER TABLE "PrivatePostDraft" ADD CONSTRAINT "PrivatePostDraft_version_check" CHECK ("version" > 0), ADD CONSTRAINT "PrivatePostDraft_payload_check" CHECK (("deletedAt" IS NULL AND jsonb_typeof("payload") = 'object') OR ("deletedAt" IS NOT NULL AND "payload" = 'null'::jsonb));
ALTER TABLE "SavedPostCollection" ADD CONSTRAINT "SavedPostCollection_version_check" CHECK ("version" > 0);
ALTER TABLE "SavedPostItem" ADD CONSTRAINT "SavedPostItem_version_check" CHECK ("version" > 0);
