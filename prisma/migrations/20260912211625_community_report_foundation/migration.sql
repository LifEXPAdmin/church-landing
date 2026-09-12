-- CreateEnum
CREATE TYPE "CommunityReportTarget" AS ENUM ('POST', 'COMMENT', 'PROFILE', 'CHURCH');

-- CreateEnum
CREATE TYPE "CommunityReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'PRIVACY', 'SAFETY', 'IMPERSONATION', 'OTHER');

-- CreateEnum
CREATE TYPE "CommunityReportStatus" AS ENUM ('RECEIVED', 'CLOSED', 'FOLLOW_UP_REQUIRED');

-- AlterEnum
ALTER TYPE "OperatorCapability" ADD VALUE 'REVIEW_COMMUNITY_REPORTS';

-- CreateTable
CREATE TABLE "CommunityReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "CommunityReportTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetVersion" INTEGER NOT NULL,
    "contextVersion" INTEGER NOT NULL DEFAULT 0,
    "scopeChurchId" TEXT,
    "reason" "CommunityReportReason" NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "status" "CommunityReportStatus" NOT NULL DEFAULT 'RECEIVED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityReportDecision" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fromStatus" "CommunityReportStatus" NOT NULL,
    "toStatus" "CommunityReportStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityReportDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityReport_reporterId_createdAt_id_idx" ON "CommunityReport"("reporterId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "CommunityReport_scopeChurchId_status_createdAt_idx" ON "CommunityReport"("scopeChurchId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityReport_targetType_targetId_idx" ON "CommunityReport"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityReport_reporterId_targetType_targetId_targetVersio_key" ON "CommunityReport"("reporterId", "targetType", "targetId", "targetVersion", "contextVersion");

-- CreateIndex
CREATE INDEX "CommunityReportDecision_reportId_createdAt_idx" ON "CommunityReportDecision"("reportId", "createdAt");

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_scopeChurchId_fkey" FOREIGN KEY ("scopeChurchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReportDecision" ADD CONSTRAINT "CommunityReportDecision_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "CommunityReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReportDecision" ADD CONSTRAINT "CommunityReportDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

