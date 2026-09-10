-- CreateEnum
CREATE TYPE "ChurchListingStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'NEEDS_INFORMATION', 'PUBLISHED', 'REJECTED', 'WITHDRAWN');

-- AlterEnum
ALTER TYPE "OperatorCapability" ADD VALUE 'REVIEW_CHURCH_LISTINGS';

-- AlterTable
ALTER TABLE "Church" ADD COLUMN     "city" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "communityListed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "denomination" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "locationModel" TEXT NOT NULL DEFAULT 'NO_BUILDING',
ADD COLUMN     "meetingInfo" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "publicEmail" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "publicPhone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "region" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "serviceArea" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "source" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "website" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "ChurchListingSubmission" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "churchId" TEXT,
    "baseVersion" INTEGER,
    "data" JSONB NOT NULL,
    "status" "ChurchListingStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "reviewReason" TEXT NOT NULL DEFAULT '',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChurchListingSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurchListingDecision" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChurchListingDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChurchListingSubmission_ownerId_updatedAt_idx" ON "ChurchListingSubmission"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChurchListingSubmission_status_updatedAt_idx" ON "ChurchListingSubmission"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ChurchListingSubmission_churchId_idx" ON "ChurchListingSubmission"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchListingSubmission_ownerId_requestKey_key" ON "ChurchListingSubmission"("ownerId", "requestKey");

-- CreateIndex
CREATE INDEX "ChurchListingDecision_submissionId_createdAt_idx" ON "ChurchListingDecision"("submissionId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChurchListingSubmission" ADD CONSTRAINT "ChurchListingSubmission_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchListingSubmission" ADD CONSTRAINT "ChurchListingSubmission_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchListingDecision" ADD CONSTRAINT "ChurchListingDecision_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ChurchListingSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Church" ADD CONSTRAINT "Church_positive_version" CHECK ("version" > 0);
ALTER TABLE "Church" ADD CONSTRAINT "Church_location_model" CHECK ("locationModel" IN ('PHYSICAL', 'ROTATING', 'NO_BUILDING'));
ALTER TABLE "ChurchListingSubmission" ADD CONSTRAINT "ChurchListing_valid_kind" CHECK ("kind" IN ('COMMUNITY', 'CORRECTION'));
ALTER TABLE "ChurchListingSubmission" ADD CONSTRAINT "ChurchListing_positive_version" CHECK ("version" > 0);
ALTER TABLE "ChurchListingSubmission" ADD CONSTRAINT "ChurchListing_correction_church" CHECK ("kind" <> 'CORRECTION' OR ("churchId" IS NOT NULL AND "baseVersion" > 0));
ALTER TABLE "ChurchListingSubmission" ADD CONSTRAINT "ChurchListing_published_church" CHECK ("status" <> 'PUBLISHED' OR "churchId" IS NOT NULL);
ALTER TABLE "ChurchListingSubmission" ADD CONSTRAINT "ChurchListing_object_data" CHECK (jsonb_typeof("data") = 'object');
