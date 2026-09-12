-- Additive empty reference collections; no upload duplication or data backfill.
CREATE UNIQUE INDEX "PersonalPhoto_assetId_ownerId_key" ON "PersonalPhoto"("assetId", "ownerId");
CREATE TABLE "PhotoAlbum" (
 id TEXT PRIMARY KEY,
 "ownerId" TEXT NOT NULL REFERENCES "PlatformUser"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
 name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
 audience "PersonalPhotoAudience" NOT NULL DEFAULT 'ONLY_ME',
 "audienceChurchId" TEXT REFERENCES "Church"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "coverAssetId" TEXT,
 CONSTRAINT "PhotoAlbum_audience" CHECK (audience IN ('ONLY_ME','MEMBERS','CHURCH') AND ((audience = 'CHURCH') = ("audienceChurchId" IS NOT NULL))),
 UNIQUE(id, "ownerId"),
 FOREIGN KEY ("coverAssetId", "ownerId") REFERENCES "PersonalPhoto"("assetId", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PhotoAlbum_ownerId_createdAt_id_idx" ON "PhotoAlbum"("ownerId", "createdAt", id);
CREATE TABLE "PhotoAlbumEntry" (
 "albumId" TEXT NOT NULL,
 "assetId" TEXT NOT NULL,
 "ownerId" TEXT NOT NULL,
 position INTEGER NOT NULL CHECK (position >= 0 AND position < 100),
 PRIMARY KEY ("albumId", "assetId"),
 UNIQUE("albumId", position),
 FOREIGN KEY ("albumId", "ownerId") REFERENCES "PhotoAlbum"(id, "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("assetId", "ownerId") REFERENCES "PersonalPhoto"("assetId", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PhotoAlbumEntry_assetId_idx" ON "PhotoAlbumEntry"("assetId");
