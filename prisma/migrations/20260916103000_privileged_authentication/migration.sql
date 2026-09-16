ALTER TABLE "AdminAuthenticator" ADD COLUMN "recoveryRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "quarantinedAt" TIMESTAMP(3);
UPDATE "AdminAuthenticator" SET "recoveryRequired" = true WHERE "confirmedAt" IS NOT NULL;
ALTER TABLE "AdminAuthenticator" DROP CONSTRAINT "AdminAuthenticator_bounds";
ALTER TABLE "AdminAuthenticator" ADD CONSTRAINT "AdminAuthenticator_bounds" CHECK (
  ("quarantinedAt" IS NULL AND length("secretCiphertext") BETWEEN 50 AND 512 AND cardinality("recoveryHashes") <= 8)
  OR ("quarantinedAt" IS NOT NULL AND "secretCiphertext" = '' AND "recoveryRequired" AND "confirmedAt" IS NULL AND cardinality("recoveryHashes") = 0)
);

CREATE TABLE "PrivilegedSessionProof" (
  "sessionId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "factorVersion" INTEGER NOT NULL,
  "credentialVersion" INTEGER NOT NULL,
  "authorityDigest" TEXT NOT NULL,
  "confirmedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  CONSTRAINT "PrivilegedSessionProof_pkey" PRIMARY KEY ("sessionId", "purpose"),
  CONSTRAINT "PrivilegedSessionProof_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PlatformSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PrivilegedSessionProof_purpose_check" CHECK ("purpose" IN ('privileged-work', 'change-access', 'export-metrics', 'redact-support', 'send-announcement'))
);
CREATE INDEX "PrivilegedSessionProof_expiresAt_idx" ON "PrivilegedSessionProof"("expiresAt");

CREATE TABLE "PrivilegedSecurityNotice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "factorVersion" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  "attemptedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "PrivilegedSecurityNotice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrivilegedSecurityNotice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PrivilegedSecurityNotice_action_check" CHECK ("action" IN ('confirmed', 'replaced', 'recovered'))
);
CREATE UNIQUE INDEX "PrivilegedSecurityNotice_userId_factorVersion_action_key" ON "PrivilegedSecurityNotice"("userId", "factorVersion", "action");
CREATE INDEX "PrivilegedSecurityNotice_deliveredAt_createdAt_idx" ON "PrivilegedSecurityNotice"("deliveredAt", "createdAt");
