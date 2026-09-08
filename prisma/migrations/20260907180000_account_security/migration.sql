ALTER TABLE "PlatformUser" ADD COLUMN "credentialVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlatformUser" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "PlatformSession" ADD COLUMN "credentialVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "AccountGrantPurpose" AS ENUM ('RESET_PASSWORD', 'VERIFY_EMAIL');
CREATE TABLE "PlatformAccountGrant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "purpose" "AccountGrantPurpose" NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "credentialVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3)
);
CREATE INDEX "PlatformAccountGrant_userId_purpose_idx" ON "PlatformAccountGrant"("userId", "purpose");
CREATE INDEX "PlatformAccountGrant_expiresAt_idx" ON "PlatformAccountGrant"("expiresAt");
CREATE TABLE "PlatformAuthLimit" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "hits" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "PlatformAuthLimit_expiresAt_idx" ON "PlatformAuthLimit"("expiresAt");
