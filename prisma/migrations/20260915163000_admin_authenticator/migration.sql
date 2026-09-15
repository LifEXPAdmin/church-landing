CREATE TABLE "AdminAuthenticator" (
  "userId" TEXT PRIMARY KEY,
  "secretCiphertext" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  "credentialVersion" INTEGER NOT NULL,
  "sessionId" TEXT NOT NULL,
  "enrollmentRequestKey" TEXT NOT NULL,
  "confirmationRequestKey" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastCounter" BIGINT NOT NULL DEFAULT -1,
  "recoveryHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  CONSTRAINT "AdminAuthenticator_userId_fkey" FOREIGN KEY("userId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE,
  CONSTRAINT "AdminAuthenticator_bounds" CHECK(length("secretCiphertext") BETWEEN 50 AND 512 AND cardinality("recoveryHashes")<=8)
);
