CREATE TABLE "PlatformGoogleIdentity" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  CONSTRAINT "PlatformGoogleIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformGoogleIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlatformGoogleIdentity_userId_key" ON "PlatformGoogleIdentity"("userId");
CREATE UNIQUE INDEX "PlatformGoogleIdentity_issuer_subject_key" ON "PlatformGoogleIdentity"("issuer", "subject");

CREATE TABLE "PlatformGoogleAttempt" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "stateHash" TEXT NOT NULL,
  "browserHash" TEXT NOT NULL,
  "nonceHash" TEXT NOT NULL,
  "returnTo" TEXT NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "linkUserId" TEXT,
  "linkSessionId" TEXT,
  "credentialVersion" INTEGER,
  "signupTokenHash" TEXT,
  "subject" TEXT,
  "email" TEXT,
  "emailAuthoritative" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "PlatformGoogleAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformGoogleAttempt_linkUserId_fkey" FOREIGN KEY ("linkUserId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlatformGoogleAttempt_stateHash_key" ON "PlatformGoogleAttempt"("stateHash");
CREATE UNIQUE INDEX "PlatformGoogleAttempt_signupTokenHash_key" ON "PlatformGoogleAttempt"("signupTokenHash");
CREATE INDEX "PlatformGoogleAttempt_expiresAt_idx" ON "PlatformGoogleAttempt"("expiresAt");
CREATE INDEX "PlatformGoogleAttempt_linkUserId_idx" ON "PlatformGoogleAttempt"("linkUserId");
