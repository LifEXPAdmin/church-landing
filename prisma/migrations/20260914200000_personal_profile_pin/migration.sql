ALTER TABLE "SocialPreferences"
  ADD COLUMN "profilePinPostId" TEXT,
  ADD COLUMN "profilePinVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SocialPreferences" ADD CONSTRAINT "SocialPreferences_profilePinPostId_fkey"
  FOREIGN KEY ("profilePinPostId") REFERENCES "PlatformPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SocialPreferences" ADD CONSTRAINT "SocialPreferences_profilePinVersion_check"
  CHECK ("profilePinVersion" >= 0);
CREATE INDEX "SocialPreferences_profilePinPostId_idx" ON "SocialPreferences"("profilePinPostId");
