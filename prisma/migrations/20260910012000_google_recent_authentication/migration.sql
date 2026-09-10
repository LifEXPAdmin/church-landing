ALTER TABLE "PlatformGoogleAttempt"
  ADD COLUMN "reauthPurpose" TEXT,
  ADD COLUMN "reactivationTokenHash" TEXT;
CREATE UNIQUE INDEX "PlatformGoogleAttempt_reactivationTokenHash_key" ON "PlatformGoogleAttempt"("reactivationTokenHash");

CREATE TABLE "PlatformRecentAuthentication" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "credentialVersion" INTEGER NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "googleIdentityId" TEXT NOT NULL,
  CONSTRAINT "PlatformRecentAuthentication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformRecentAuthentication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlatformRecentAuthentication_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PlatformSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlatformRecentAuthentication_googleIdentityId_fkey" FOREIGN KEY ("googleIdentityId") REFERENCES "PlatformGoogleIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlatformRecentAuthentication_tokenHash_key" ON "PlatformRecentAuthentication"("tokenHash");
CREATE UNIQUE INDEX "PlatformRecentAuthentication_sessionId_purpose_key" ON "PlatformRecentAuthentication"("sessionId", "purpose");
CREATE INDEX "PlatformRecentAuthentication_userId_idx" ON "PlatformRecentAuthentication"("userId");
CREATE INDEX "PlatformRecentAuthentication_googleIdentityId_idx" ON "PlatformRecentAuthentication"("googleIdentityId");
CREATE INDEX "PlatformRecentAuthentication_expiresAt_idx" ON "PlatformRecentAuthentication"("expiresAt");
