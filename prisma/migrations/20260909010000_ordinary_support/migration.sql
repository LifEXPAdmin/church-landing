-- CreateEnum
CREATE TYPE "SupportCapability" AS ENUM ('RESPOND', 'ASSIGN', 'REDACT');

-- CreateEnum
CREATE TYPE "SupportCategory" AS ENUM ('ACCOUNT_WEBSITE', 'CHURCH_SETUP', 'DIRECTORY_SHARING', 'FEATURE_SUGGESTION');

-- CreateEnum
CREATE TYPE "SupportStatus" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportFeatureDecision" AS ENUM ('RECEIVED', 'UNDER_CONSIDERATION', 'PLANNED', 'DELIVERED', 'DEFERRED', 'DECLINED');

-- CreateTable
CREATE TABLE "SupportCapabilityGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capability" "SupportCapability" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportCapabilityGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportIntakeSetting" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "ownerGrantId" TEXT NOT NULL,
    "approvedNoticeVersion" TEXT,

    CONSTRAINT "SupportIntakeSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportCase" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "churchId" TEXT,
    "category" "SupportCategory" NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerGrantId" TEXT,
    "ownerGrantVersion" INTEGER,
    "status" "SupportStatus" NOT NULL DEFAULT 'RECEIVED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "resolution" TEXT,
    "featureDecision" "SupportFeatureDecision",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportCoordinatorShare" (
    "caseId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "appointmentVersion" INTEGER NOT NULL,
    "requesterConnectionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "SupportCoordinatorShare_pkey" PRIMARY KEY ("caseId")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redactedAt" TIMESTAMP(3),

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportRead" (
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,

    CONSTRAINT "SupportRead_pkey" PRIMARY KEY ("caseId","userId")
);

-- CreateTable
CREATE TABLE "SupportOperation" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,

    CONSTRAINT "SupportOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportAuditEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "fromState" TEXT,
    "toState" TEXT,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportCapabilityGrant_userId_capability_key" ON "SupportCapabilityGrant"("userId", "capability");

-- CreateIndex
CREATE INDEX "SupportCase_requesterId_updatedAt_idx" ON "SupportCase"("requesterId", "updatedAt");

-- CreateIndex
CREATE INDEX "SupportCase_ownerGrantId_updatedAt_idx" ON "SupportCase"("ownerGrantId", "updatedAt");

-- CreateIndex
CREATE INDEX "SupportCase_status_updatedAt_idx" ON "SupportCase"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "SupportMessage_caseId_version_idx" ON "SupportMessage"("caseId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SupportOperation_actorId_requestKey_key" ON "SupportOperation"("actorId", "requestKey");

-- CreateIndex
CREATE INDEX "SupportAuditEvent_caseId_createdAt_idx" ON "SupportAuditEvent"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportAuditEvent_actorId_createdAt_idx" ON "SupportAuditEvent"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportCapabilityGrant" ADD CONSTRAINT "SupportCapabilityGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportIntakeSetting" ADD CONSTRAINT "SupportIntakeSetting_ownerGrantId_fkey" FOREIGN KEY ("ownerGrantId") REFERENCES "SupportCapabilityGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_ownerGrantId_fkey" FOREIGN KEY ("ownerGrantId") REFERENCES "SupportCapabilityGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCoordinatorShare" ADD CONSTRAINT "SupportCoordinatorShare_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCoordinatorShare" ADD CONSTRAINT "SupportCoordinatorShare_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "ChurchContactAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCoordinatorShare" ADD CONSTRAINT "SupportCoordinatorShare_requesterConnectionId_fkey" FOREIGN KEY ("requesterConnectionId") REFERENCES "ChurchConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportRead" ADD CONSTRAINT "SupportRead_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportRead" ADD CONSTRAINT "SupportRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportOperation" ADD CONSTRAINT "SupportOperation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportOperation" ADD CONSTRAINT "SupportOperation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAuditEvent" ADD CONSTRAINT "SupportAuditEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep the case's identity and church context fixed even outside application code.
CREATE FUNCTION support_case_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."requesterId" IS DISTINCT FROM OLD."requesterId"
     OR NEW."churchId" IS DISTINCT FROM OLD."churchId"
     OR NEW."category" IS DISTINCT FROM OLD."category" THEN
    RAISE EXCEPTION 'Support case context is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "SupportCase_identity_immutable" BEFORE UPDATE ON "SupportCase"
FOR EACH ROW EXECUTE FUNCTION support_case_identity_immutable();
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_bounds" CHECK (
  "version" > 0 AND char_length(subject) BETWEEN 3 AND 120
  AND char_length(description) BETWEEN 10 AND 3000
  AND (resolution IS NULL OR char_length(resolution) BETWEEN 3 AND 1000)
  AND (("ownerGrantId" IS NULL AND "ownerGrantVersion" IS NULL)
    OR ("ownerGrantId" IS NOT NULL AND "ownerGrantVersion" IS NOT NULL AND "ownerGrantVersion" > 0))
  AND ((category = 'FEATURE_SUGGESTION' AND "featureDecision" IS NOT NULL)
    OR (category <> 'FEATURE_SUGGESTION' AND "featureDecision" IS NULL))
);
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_bounds" CHECK (
  "version" > 0 AND char_length(body) BETWEEN 1 AND 2000
  AND kind IN ('REPLY', 'TRANSITION', 'RESOLUTION', 'REOPEN', 'FEATURE')
);
ALTER TABLE "SupportCapabilityGrant" ADD CONSTRAINT "SupportCapabilityGrant_version" CHECK (version > 0);
ALTER TABLE "SupportCoordinatorShare" ADD CONSTRAINT "SupportCoordinatorShare_version" CHECK ("appointmentVersion" > 0);
ALTER TABLE "SupportRead" ADD CONSTRAINT "SupportRead_version" CHECK (version > 0);
ALTER TABLE "SupportOperation" ADD CONSTRAINT "SupportOperation_bounds" CHECK (version > 0 AND char_length(fingerprint) = 64 AND char_length("requestKey") = 36);
ALTER TABLE "SupportAuditEvent" ADD CONSTRAINT "SupportAuditEvent_version" CHECK (version > 0);
-- Revoking or renewing a grant changes its generation even in a manual provisioning transaction.
CREATE FUNCTION support_grant_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW.capability IS DISTINCT FROM OLD.capability THEN
    RAISE EXCEPTION 'Support grant identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.version < OLD.version THEN
    RAISE EXCEPTION 'Support grant generation cannot decrease' USING ERRCODE = '23514';
  END IF;
  IF NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt" AND NEW.version <= OLD.version THEN
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "SupportCapabilityGrant_generation" BEFORE UPDATE ON "SupportCapabilityGrant"
FOR EACH ROW EXECUTE FUNCTION support_grant_generation();
