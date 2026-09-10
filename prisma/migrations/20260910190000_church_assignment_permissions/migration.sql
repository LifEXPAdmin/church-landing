-- AlterTable
ALTER TABLE "ChurchPositionAssignment" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ChurchRoleGrant" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "capability" "ChurchCapability" NOT NULL,
    "grantedById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ChurchRoleGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurchAssignmentSave" (
    "requestKey" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "resultVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChurchAssignmentSave_pkey" PRIMARY KEY ("requestKey")
);

-- CreateIndex
CREATE INDEX "ChurchRoleGrant_churchId_capability_revokedAt_idx" ON "ChurchRoleGrant"("churchId", "capability", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchRoleGrant_assignmentId_capability_key" ON "ChurchRoleGrant"("assignmentId", "capability");

-- CreateIndex
CREATE INDEX "ChurchAssignmentSave_assignmentId_idx" ON "ChurchAssignmentSave"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchPositionAssignment_id_churchId_connectionId_key" ON "ChurchPositionAssignment"("id", "churchId", "connectionId");

-- AddForeignKey
ALTER TABLE "ChurchRoleGrant" ADD CONSTRAINT "ChurchRoleGrant_assignmentId_churchId_connectionId_fkey" FOREIGN KEY ("assignmentId", "churchId", "connectionId") REFERENCES "ChurchPositionAssignment"("id", "churchId", "connectionId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ChurchRoleGrant" ADD CONSTRAINT "ChurchRoleGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchAssignmentSave" ADD CONSTRAINT "ChurchAssignmentSave_assignmentId_churchId_connectionId_fkey" FOREIGN KEY ("assignmentId", "churchId", "connectionId") REFERENCES "ChurchPositionAssignment"("id", "churchId", "connectionId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ChurchPositionAssignment" ADD CONSTRAINT "ChurchPositionAssignment_positive_version" CHECK (version > 0);
ALTER TABLE "ChurchRoleGrant" ADD CONSTRAINT "ChurchRoleGrant_supported_capability" CHECK (capability <> 'MANAGE_CHURCH_PROFILE');
ALTER TABLE "ChurchRoleGrant" ADD CONSTRAINT "ChurchRoleGrant_positive_version" CHECK (version > 0);
ALTER TABLE "ChurchAssignmentSave" ADD CONSTRAINT "ChurchAssignmentSave_valid_receipt" CHECK ("resultVersion" > 0 AND length("requestKey") BETWEEN 16 AND 100 AND length("inputHash") = 64);
-- Titles and existing appointments acquire no grants during this migration.
-- Positive versions make stale-save comparisons meaningful.
