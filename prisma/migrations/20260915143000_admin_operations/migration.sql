-- CreateEnum
CREATE TYPE "AdminPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- Additive admin metadata only. This migration creates no operator grants,
-- enables no intake, and copies no private case bodies.
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OperatorCapability" ADD VALUE 'VIEW_PLATFORM_METRICS';
ALTER TYPE "OperatorCapability" ADD VALUE 'EXPORT_PLATFORM_METRICS';
ALTER TYPE "OperatorCapability" ADD VALUE 'VIEW_OPERATIONAL_HEALTH';
ALTER TYPE "OperatorCapability" ADD VALUE 'LOOKUP_ACCOUNTS';
ALTER TYPE "OperatorCapability" ADD VALUE 'VIEW_ADMIN_AUDIT';
ALTER TYPE "OperatorCapability" ADD VALUE 'MANAGE_ADMIN_ACCESS';

-- AlterTable
ALTER TABLE "CommunityReport" ADD COLUMN     "adminGroupId" TEXT,
ADD COLUMN     "assignedReviewerId" TEXT,
ADD COLUMN     "nextAction" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "priority" "AdminPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "reminderAt" TIMESTAMP(3),
ADD COLUMN     "triageTags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "PlatformOperatorGrant" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "SupportCase" ADD COLUMN     "adminGroupId" TEXT,
ADD COLUMN     "bugActual" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bugEnvironment" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bugExpected" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bugSteps" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "engineeringUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "nextAction" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "priority" "AdminPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "reminderAt" TIMESTAMP(3),
ADD COLUMN     "reproducibility" TEXT NOT NULL DEFAULT 'UNREVIEWED',
ADD COLUMN     "triageTags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "ChurchClaim" ADD COLUMN     "adminGroupId" TEXT,
ADD COLUMN     "assignedReviewerId" TEXT,
ADD COLUMN     "nextAction" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "priority" "AdminPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "reminderAt" TIMESTAMP(3),
ADD COLUMN     "triageTags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "AdminCaseGroup" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "engineeringUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminCaseGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminCaseNote" (
    "id" TEXT NOT NULL,
    "supportCaseId" TEXT,
    "reportId" TEXT,
    "claimId" TEXT,
    "actorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redactedAt" TIMESTAMP(3),

    CONSTRAINT "AdminCaseNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSavedView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminSavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminOperation" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "targetId" TEXT,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminCaseNote_supportCaseId_createdAt_id_idx" ON "AdminCaseNote"("supportCaseId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AdminCaseNote_reportId_createdAt_id_idx" ON "AdminCaseNote"("reportId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AdminCaseNote_claimId_createdAt_id_idx" ON "AdminCaseNote"("claimId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSavedView_userId_name_key" ON "AdminSavedView"("userId", "name");

-- CreateIndex
CREATE INDEX "AdminOperation_sourceType_sourceId_createdAt_id_idx" ON "AdminOperation"("sourceType", "sourceId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AdminOperation_createdAt_id_idx" ON "AdminOperation"("createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AdminOperation_actorId_requestKey_key" ON "AdminOperation"("actorId", "requestKey");

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_adminGroupId_fkey" FOREIGN KEY ("adminGroupId") REFERENCES "AdminCaseGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_adminGroupId_fkey" FOREIGN KEY ("adminGroupId") REFERENCES "AdminCaseGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchClaim" ADD CONSTRAINT "ChurchClaim_adminGroupId_fkey" FOREIGN KEY ("adminGroupId") REFERENCES "AdminCaseGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminCaseGroup" ADD CONSTRAINT "AdminCaseGroup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminCaseNote" ADD CONSTRAINT "AdminCaseNote_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminCaseNote" ADD CONSTRAINT "AdminCaseNote_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "CommunityReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminCaseNote" ADD CONSTRAINT "AdminCaseNote_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ChurchClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminCaseNote" ADD CONSTRAINT "AdminCaseNote_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminSavedView" ADD CONSTRAINT "AdminSavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminOperation" ADD CONSTRAINT "AdminOperation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdminCaseNote" ADD CONSTRAINT "AdminCaseNote_one_source"
  CHECK (num_nonnulls("supportCaseId", "reportId", "claimId") = 1);
ALTER TABLE "AdminCaseNote" ADD CONSTRAINT "AdminCaseNote_bounded"
  CHECK (length(body) BETWEEN 1 AND 2000 AND "sourceVersion" > 0);
ALTER TABLE "AdminSavedView" ADD CONSTRAINT "AdminSavedView_bounded"
  CHECK (length(name) BETWEEN 1 AND 60 AND pg_column_size(filters) <= 4096 AND version > 0);
ALTER TABLE "AdminCaseGroup" ADD CONSTRAINT "AdminCaseGroup_bounded"
  CHECK (length(title) BETWEEN 1 AND 120 AND length("engineeringUrl") <= 500);
ALTER TABLE "PlatformOperatorGrant" ADD CONSTRAINT "PlatformOperatorGrant_positive_version"
  CHECK (version > 0);

-- Existing revoke paths also receive a new generation. Renewal never restores
-- a stale action snapshot; a grant cannot be retargeted to another identity.
CREATE FUNCTION protect_operator_grant_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."userId" <> OLD."userId" OR NEW.capability <> OLD.capability THEN
    RAISE EXCEPTION 'An operator grant cannot be retargeted';
  END IF;
  IF NEW.version < OLD.version THEN RAISE EXCEPTION 'Grant version cannot decrease'; END IF;
  IF NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt" THEN
    NEW.version := greatest(NEW.version, OLD.version + 1);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PlatformOperatorGrant_identity"
  BEFORE UPDATE ON "PlatformOperatorGrant"
  FOR EACH ROW EXECUTE FUNCTION protect_operator_grant_identity();

-- Notes can only be privacy-redacted, never edited into a requester reply or
-- moved to a different case. Erasure uses the same fixed marker.
CREATE FUNCTION protect_admin_note_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."supportCaseId",NEW."reportId",NEW."claimId",NEW."actorId",NEW."sourceVersion",NEW."createdAt")
     IS DISTINCT FROM ROW(OLD."supportCaseId",OLD."reportId",OLD."claimId",OLD."actorId",OLD."sourceVersion",OLD."createdAt") THEN
    RAISE EXCEPTION 'An internal note cannot be retargeted';
  END IF;
  IF NEW.body IS DISTINCT FROM OLD.body AND
    (NEW.body <> '[Removed for privacy.]' OR NEW."redactedAt" IS NULL) THEN
    RAISE EXCEPTION 'An internal note is immutable except for privacy redaction';
  END IF;
  IF OLD."redactedAt" IS NOT NULL AND NEW."redactedAt" IS NULL THEN
    RAISE EXCEPTION 'A redacted note cannot be restored';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "AdminCaseNote_identity" BEFORE UPDATE ON "AdminCaseNote"
  FOR EACH ROW EXECUTE FUNCTION protect_admin_note_identity();
