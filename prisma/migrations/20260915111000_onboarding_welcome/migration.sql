-- Optional progress is private account preference, never authority or consent.
ALTER TABLE "SocialPreferences" ADD COLUMN "onboardingDismissed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "onboardingVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TYPE "ChurchCapability" ADD VALUE 'HOST_CHURCH_WELCOME';
ALTER TABLE "Church" ADD COLUMN "welcomePostId" TEXT,
  ADD COLUMN "welcomeVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Church" ADD CONSTRAINT "Church_welcomePostId_fkey"
  FOREIGN KEY ("welcomePostId") REFERENCES "PlatformPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "ChurchWelcomeThread" (
  "postId" TEXT PRIMARY KEY,
  "churchId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "handled" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChurchWelcomeThread_purpose_check" CHECK ("purpose" IN ('NONE', 'INTRODUCTION', 'QUESTION')),
  CONSTRAINT "ChurchWelcomeThread_postId_fkey" FOREIGN KEY ("postId") REFERENCES "PlatformPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChurchWelcomeThread_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ChurchWelcomeThread_churchId_handled_postId_idx" ON "ChurchWelcomeThread"("churchId", "handled", "postId");
