ALTER TABLE "PlatformPost"
  ADD COLUMN "discoveryLanguage" TEXT,
  ADD COLUMN "discoveryDenomination" TEXT,
  ADD COLUMN "discoveryCountry" TEXT,
  ADD COLUMN "discoveryPlaceId" INTEGER,
  ADD COLUMN "discoveryRegion" TEXT,
  ADD COLUMN "discoveryLatitude" DOUBLE PRECISION,
  ADD COLUMN "discoveryLongitude" DOUBLE PRECISION;
ALTER TABLE "PlatformPost" ADD CONSTRAINT "PlatformPost_discovery_shape_check" CHECK (
  ("discoveryLanguage" IS NULL OR "discoveryLanguage" ~ '^[a-z]{2}$')
  AND ("discoveryDenomination" IS NULL OR (length("discoveryDenomination") >= 1 AND length("discoveryDenomination") <= 80))
  AND ("discoveryCountry" IS NULL OR "discoveryCountry" ~ '^[A-Z]{2}$')
  AND (("discoveryPlaceId" IS NULL AND "discoveryRegion" IS NULL AND "discoveryLatitude" IS NULL AND "discoveryLongitude" IS NULL)
    OR ("discoveryPlaceId" IS NOT NULL AND "discoveryPlaceId" > 0 AND "discoveryCountry" IS NOT NULL
      AND "discoveryRegion" IS NOT NULL AND length("discoveryRegion") <= 20
      AND "discoveryLatitude" IS NOT NULL AND "discoveryLatitude" >= -90 AND "discoveryLatitude" <= 90
      AND "discoveryLongitude" IS NOT NULL AND "discoveryLongitude" >= -180 AND "discoveryLongitude" <= 180)));
CREATE INDEX "PlatformPost_discoveryCountry_status_publishedAt_idx" ON "PlatformPost"("discoveryCountry", status, "publishedAt" DESC);
CREATE INDEX "PlatformPost_discoveryDenomination_status_publishedAt_idx" ON "PlatformPost"("discoveryDenomination", status, "publishedAt" DESC);
ALTER TABLE "SocialPreferences"
  ADD COLUMN discovery JSONB,
  ADD COLUMN "discoveryVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discoveryRecoveryRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SocialPreferences" ADD CONSTRAINT "SocialPreferences_discovery_shape_check" CHECK (
  "discoveryVersion" >= 0 AND (discovery IS NULL OR (jsonb_typeof(discovery)='object' AND octet_length(discovery::text) <= 32768)));
ALTER TABLE "FeedSnapshot" ADD COLUMN "selectionKey" TEXT;
CREATE INDEX "FeedSnapshot_ownerId_mode_selectionKey_createdAt_idx" ON "FeedSnapshot"("ownerId", mode, "selectionKey", "createdAt");
ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_kind_check";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_kind_check" CHECK (
  kind IN ('REPORT','HOLD','MODERATION_POST','MODERATION_COMMENT','MODERATION_TOPIC','APPEAL',
    'ACCOUNT_STATE','AUTHOR_WITHDRAW_POST','AUTHOR_WITHDRAW_COMMENT','TOPIC_ACCESS','POST_DISCOVERY','DISCOVERY_PREFERENCES'));
ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_account_scope";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_account_scope" CHECK (
  (kind='ACCOUNT_STATE' AND target::text='ACCOUNT' AND "sourceId"="targetId")
  OR (kind IN ('TOPIC_ACCESS','POST_DISCOVERY','DISCOVERY_PREFERENCES') AND target::text='ACCOUNT')
  OR (kind NOT IN ('ACCOUNT_STATE','TOPIC_ACCESS','POST_DISCOVERY','DISCOVERY_PREFERENCES') AND target::text<>'ACCOUNT'));
