-- Add password-backed platform accounts and opaque session tokens.
ALTER TABLE "PlatformUser" ADD COLUMN "passwordHash" TEXT;

CREATE TABLE "PlatformSession" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAgent" TEXT,

    CONSTRAINT "PlatformSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformSession_tokenHash_key" ON "PlatformSession"("tokenHash");
CREATE INDEX "PlatformSession_userId_idx" ON "PlatformSession"("userId");
CREATE INDEX "PlatformSession_expiresAt_idx" ON "PlatformSession"("expiresAt");

ALTER TABLE "PlatformSession" ADD CONSTRAINT "PlatformSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
