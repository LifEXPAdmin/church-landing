-- CreateEnum
CREATE TYPE "ChurchClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'NEEDS_INFORMATION', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'REVOKED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChurchCapability" ADD VALUE 'MANAGE_CHURCH_PROFILE';
ALTER TYPE "ChurchCapability" ADD VALUE 'MANAGE_CHURCH_ACCESS';

-- AlterEnum
ALTER TYPE "OperatorCapability" ADD VALUE 'REVIEW_CHURCH_CLAIMS';

-- AlterTable
ALTER TABLE "Church" ADD COLUMN     "managementVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ChurchCapabilityGrant" ADD COLUMN     "sourceClaimId" TEXT;

-- CreateTable
CREATE TABLE "ChurchClaim" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "churchId" TEXT,
    "kind" TEXT NOT NULL,
    "authority" JSONB NOT NULL,
    "profile" JSONB NOT NULL,
    "preparation" TEXT NOT NULL DEFAULT '',
    "scopes" "ChurchCapability"[] DEFAULT ARRAY[]::"ChurchCapability"[],
    "status" "ChurchClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "baseChurchVersion" INTEGER,
    "baseManagementVersion" INTEGER NOT NULL DEFAULT 0,
    "credentialVersion" INTEGER,
    "reviewReason" TEXT NOT NULL DEFAULT '',
    "approvedBy" TEXT,
    "policyVersion" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChurchClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurchClaimDecision" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChurchClaimDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChurchClaim_ownerId_createdAt_idx" ON "ChurchClaim"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "ChurchClaim_status_createdAt_idx" ON "ChurchClaim"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ChurchClaim_churchId_idx" ON "ChurchClaim"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchClaim_ownerId_requestKey_key" ON "ChurchClaim"("ownerId", "requestKey");

-- CreateIndex
CREATE INDEX "ChurchClaimDecision_claimId_createdAt_idx" ON "ChurchClaimDecision"("claimId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChurchCapabilityGrant" ADD CONSTRAINT "ChurchCapabilityGrant_sourceClaimId_fkey" FOREIGN KEY ("sourceClaimId") REFERENCES "ChurchClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchClaim" ADD CONSTRAINT "ChurchClaim_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchClaim" ADD CONSTRAINT "ChurchClaim_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchClaimDecision" ADD CONSTRAINT "ChurchClaimDecision_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ChurchClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "ChurchClaim" ADD CONSTRAINT "ChurchClaim_kind_check" CHECK (kind IN ('INITIAL', 'ACCESS', 'DISPUTE'));
ALTER TABLE "ChurchClaim" ADD CONSTRAINT "ChurchClaim_version_check" CHECK (version > 0 AND "baseManagementVersion" >= 0);
ALTER TABLE "ChurchClaim" ADD CONSTRAINT "ChurchClaim_json_check" CHECK (jsonb_typeof(authority) = 'object' AND jsonb_typeof(profile) = 'object');
ALTER TABLE "ChurchClaim" ADD CONSTRAINT "ChurchClaim_activation_check" CHECK ("activatedAt" IS NULL OR ("churchId" IS NOT NULL AND "approvedAt" IS NOT NULL));
ALTER TABLE "ChurchClaimDecision" ADD CONSTRAINT "ChurchClaimDecision_json_check" CHECK (jsonb_typeof(evidence) = 'object');
