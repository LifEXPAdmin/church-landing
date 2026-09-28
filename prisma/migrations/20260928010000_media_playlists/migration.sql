-- CreateTable
CREATE TABLE "MediaPlaylist" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "controlVersion" INTEGER NOT NULL DEFAULT 1,
    "ownerId" TEXT,
    "ownerChurchId" TEXT,
    "createdById" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "audience" TEXT NOT NULL DEFAULT 'PRIVATE',
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "recoveryRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "MediaPlaylist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaPlaylistEntry" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "mediaId" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "MediaPlaylistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaSavedItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "mediaId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "controlVersion" INTEGER NOT NULL DEFAULT 1,
    "removedAt" TIMESTAMP(3),
    "recoveryRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaSavedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaPlaylistEvent" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaPlaylistEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaPlaylist_ownerId_removedAt_updatedAt_id_idx" ON "MediaPlaylist"("ownerId", "removedAt", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "MediaPlaylist_ownerChurchId_removedAt_updatedAt_id_idx" ON "MediaPlaylist"("ownerChurchId", "removedAt", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "MediaPlaylist_state_audience_publishedAt_id_idx" ON "MediaPlaylist"("state", "audience", "publishedAt", "id");

-- CreateIndex
CREATE INDEX "MediaPlaylistEntry_playlistId_position_id_idx" ON "MediaPlaylistEntry"("playlistId", "position", "id");

-- CreateIndex
CREATE INDEX "MediaPlaylistEntry_mediaId_idx" ON "MediaPlaylistEntry"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaPlaylistEntry_playlistId_mediaId_key" ON "MediaPlaylistEntry"("playlistId", "mediaId");

-- CreateIndex
CREATE INDEX "MediaSavedItem_userId_removedAt_createdAt_id_idx" ON "MediaSavedItem"("userId", "removedAt", "createdAt", "id");

-- CreateIndex
CREATE INDEX "MediaSavedItem_mediaId_idx" ON "MediaSavedItem"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaSavedItem_userId_mediaId_key" ON "MediaSavedItem"("userId", "mediaId");

-- CreateIndex
CREATE INDEX "MediaPlaylistEvent_playlistId_createdAt_idx" ON "MediaPlaylistEvent"("playlistId", "createdAt");

-- AddForeignKey
ALTER TABLE "MediaPlaylist" ADD CONSTRAINT "MediaPlaylist_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaPlaylist" ADD CONSTRAINT "MediaPlaylist_ownerChurchId_fkey" FOREIGN KEY ("ownerChurchId") REFERENCES "Church"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaPlaylist" ADD CONSTRAINT "MediaPlaylist_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaPlaylistEntry" ADD CONSTRAINT "MediaPlaylistEntry_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "MediaPlaylist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaPlaylistEntry" ADD CONSTRAINT "MediaPlaylistEntry_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaSavedItem" ADD CONSTRAINT "MediaSavedItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaSavedItem" ADD CONSTRAINT "MediaSavedItem_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaPlaylistEvent" ADD CONSTRAINT "MediaPlaylistEvent_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "MediaPlaylist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaPlaylistEvent" ADD CONSTRAINT "MediaPlaylistEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Preserve strict owner/audience boundaries and private recovery tombstones.
ALTER TABLE "MediaPlaylist" ADD CONSTRAINT "playlist_owner" CHECK (
 ("ownerId" IS NOT NULL AND "ownerChurchId" IS NULL) OR
 ("ownerId" IS NULL AND "ownerChurchId" IS NOT NULL) OR
 ("ownerId" IS NULL AND "ownerChurchId" IS NULL AND ("removedAt" IS NOT NULL OR "recoveryRequired"))
), ADD CONSTRAINT "playlist_state" CHECK (state IN ('DRAFT','PUBLISHED','UNPUBLISHED','REMOVED')),
ADD CONSTRAINT "playlist_audience" CHECK (audience IN ('PRIVATE','MEMBERS','PUBLIC','CHURCH')
 AND ("ownerChurchId" IS NULL OR audience<>'PRIVATE')
 AND ("ownerId" IS NULL OR audience<>'CHURCH')),
ADD CONSTRAINT "playlist_bounds" CHECK (version>0 AND "controlVersion">0 AND length(title)<=160 AND length(description)<=2000);
ALTER TABLE "MediaPlaylistEntry" ADD CONSTRAINT "playlist_position" CHECK (position BETWEEN 0 AND 199);
ALTER TABLE "MediaSavedItem" ADD CONSTRAINT "saved_media_versions" CHECK (version>0 AND "controlVersion">0);
ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_account_scope";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_account_scope" CHECK ((((kind = ANY (ARRAY['ACCOUNT_STATE'::text, 'FEEDBACK_PROMPT'::text])) AND ((target)::text = 'ACCOUNT'::text) AND ("sourceId" = "targetId")) OR ((kind = ANY (ARRAY['GROUP_ACCESS'::text, 'TOPIC_ACCESS'::text, 'POST_DISCOVERY'::text, 'EXCHANGE_VISIBILITY'::text, 'EXCHANGE_FAVORITE'::text, 'EXCHANGE_SAVED_SEARCH'::text, 'EXCHANGE_NEED'::text, 'INTERCHURCH_HELP'::text, 'MEDIA_CATALOG'::text, 'MEDIA_PLAYLIST'::text, 'MEDIA_SAVE'::text, 'PANTRY_HUB'::text, 'EXCHANGE_INQUIRY'::text, 'EXCHANGE_CONTACT'::text, 'EXCHANGE_DEFAULTS'::text, 'DISCOVERY_PREFERENCES'::text, 'CALENDAR_LAYER'::text, 'FOLLOWING_LISTS'::text, 'NOTIFICATION_PREFERENCES'::text, 'AUTHOR_BELL'::text, 'ADMIN_SUPPORT'::text, 'ADMIN_REPORT'::text, 'ADMIN_CLAIM'::text, 'FEEDBACK_CHOICES'::text, 'FEEDBACK_IDEA'::text, 'FEEDBACK_SUBSCRIPTION'::text, 'FEEDBACK_REVIEW'::text, 'PHOTO_TAG'::text, 'PHOTO_TAG_PREFERENCES'::text, 'PROFILE_LOCATION'::text, 'PROFILE_MODULES'::text, 'VOLUNTEER_OPPORTUNITY'::text, 'VOLUNTEER_APPLICATION'::text])) AND ((target)::text = 'ACCOUNT'::text)) OR ((kind <> ALL (ARRAY['ACCOUNT_STATE'::text, 'FEEDBACK_PROMPT'::text, 'GROUP_ACCESS'::text, 'TOPIC_ACCESS'::text, 'POST_DISCOVERY'::text, 'EXCHANGE_VISIBILITY'::text, 'EXCHANGE_FAVORITE'::text, 'EXCHANGE_SAVED_SEARCH'::text, 'EXCHANGE_NEED'::text, 'INTERCHURCH_HELP'::text, 'MEDIA_CATALOG'::text, 'MEDIA_PLAYLIST'::text, 'MEDIA_SAVE'::text, 'PANTRY_HUB'::text, 'EXCHANGE_INQUIRY'::text, 'EXCHANGE_CONTACT'::text, 'EXCHANGE_DEFAULTS'::text, 'DISCOVERY_PREFERENCES'::text, 'CALENDAR_LAYER'::text, 'FOLLOWING_LISTS'::text, 'NOTIFICATION_PREFERENCES'::text, 'AUTHOR_BELL'::text, 'ADMIN_SUPPORT'::text, 'ADMIN_REPORT'::text, 'ADMIN_CLAIM'::text, 'FEEDBACK_CHOICES'::text, 'FEEDBACK_IDEA'::text, 'FEEDBACK_SUBSCRIPTION'::text, 'FEEDBACK_REVIEW'::text, 'PHOTO_TAG'::text, 'PHOTO_TAG_PREFERENCES'::text, 'PROFILE_LOCATION'::text, 'PROFILE_MODULES'::text, 'VOLUNTEER_OPPORTUNITY'::text, 'VOLUNTEER_APPLICATION'::text])) AND ((target)::text <> 'ACCOUNT'::text))));

ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_kind_check";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_kind_check" CHECK ((kind = ANY (ARRAY['REPORT'::text, 'HOLD'::text, 'MODERATION_POST'::text, 'MODERATION_COMMENT'::text, 'MODERATION_GROUP'::text, 'MODERATION_TOPIC'::text, 'MODERATION_EXCHANGE'::text, 'GROUP_ACCESS'::text, 'TOPIC_ACCESS'::text, 'POST_DISCOVERY'::text, 'EXCHANGE_VISIBILITY'::text, 'EXCHANGE_FAVORITE'::text, 'EXCHANGE_SAVED_SEARCH'::text, 'EXCHANGE_NEED'::text, 'INTERCHURCH_HELP'::text, 'MEDIA_CATALOG'::text, 'MEDIA_PLAYLIST'::text, 'MEDIA_SAVE'::text, 'PANTRY_HUB'::text, 'EXCHANGE_INQUIRY'::text, 'EXCHANGE_CONTACT'::text, 'EXCHANGE_DEFAULTS'::text, 'DISCOVERY_PREFERENCES'::text, 'CALENDAR_LAYER'::text, 'FOLLOWING_LISTS'::text, 'NOTIFICATION_PREFERENCES'::text, 'AUTHOR_BELL'::text, 'ADMIN_SUPPORT'::text, 'ADMIN_REPORT'::text, 'ADMIN_CLAIM'::text, 'APPEAL'::text, 'ACCOUNT_STATE'::text, 'AUTHOR_WITHDRAW_POST'::text, 'AUTHOR_WITHDRAW_COMMENT'::text, 'SUPPORT_MESSAGE'::text, 'SUPPORT_ATTACHMENT'::text, 'FEEDBACK_PROMPT'::text, 'FEEDBACK_CHOICES'::text, 'FEEDBACK_IDEA'::text, 'FEEDBACK_SUBSCRIPTION'::text, 'FEEDBACK_REVIEW'::text, 'PHOTO_TAG'::text, 'PHOTO_TAG_PREFERENCES'::text, 'PROFILE_LOCATION'::text, 'PROFILE_MODULES'::text, 'VOLUNTEER_OPPORTUNITY'::text, 'VOLUNTEER_APPLICATION'::text])));
