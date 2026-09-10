CREATE TABLE "PlatformEmailChange" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "newEmail" TEXT NOT NULL,
  "credentialVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformEmailChange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformEmailChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlatformEmailChange_userId_key" ON "PlatformEmailChange"("userId");
CREATE UNIQUE INDEX "PlatformEmailChange_tokenHash_key" ON "PlatformEmailChange"("tokenHash");
CREATE INDEX "PlatformEmailChange_expiresAt_idx" ON "PlatformEmailChange"("expiresAt");
