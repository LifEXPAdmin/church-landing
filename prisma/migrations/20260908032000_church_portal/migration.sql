-- CreateEnum
CREATE TYPE "ChurchConnectionState" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN', 'LEFT', 'REMOVED');

-- CreateEnum
CREATE TYPE "ChurchCapability" AS ENUM ('REVIEW_CONNECTIONS', 'APPOINT_COORDINATORS');

-- CreateEnum
CREATE TYPE "OperatorCapability" AS ENUM ('ESTABLISH_CHURCH', 'MANAGE_CHURCH_ACCESS', 'MANAGE_ACCOUNTS', 'ASSIGN_RELATIONSHIP_OWNER');

-- CreateEnum
CREATE TYPE "ChurchContactSlot" AS ENUM ('PRIMARY', 'BACKUP', 'RELATIONSHIP_OWNER');

-- CreateEnum
CREATE TYPE "DirectoryAudience" AS ENUM ('ONLY_ME', 'SAME_CHURCH');

-- AlterTable
ALTER TABLE "PlatformUser" ADD COLUMN     "adultAcknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "adultPolicyVersion" TEXT,
ADD COLUMN     "portalVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "suspendedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Church" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Church_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurchConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "state" "ChurchConnectionState" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChurchConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurchDirectoryPreference" (
    "connectionId" TEXT NOT NULL,
    "listed" BOOLEAN NOT NULL DEFAULT false,
    "displayName" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT,
    "phone" TEXT,
    "emailAudience" "DirectoryAudience" NOT NULL DEFAULT 'ONLY_ME',
    "phoneAudience" "DirectoryAudience" NOT NULL DEFAULT 'ONLY_ME',

    CONSTRAINT "ChurchDirectoryPreference_pkey" PRIMARY KEY ("connectionId")
);

-- CreateTable
CREATE TABLE "ChurchCapabilityGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "capability" "ChurchCapability" NOT NULL,
    "dependencyConnectionId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ChurchCapabilityGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformOperatorGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capability" "OperatorCapability" NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PlatformOperatorGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurchContactAssignment" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slot" "ChurchContactSlot" NOT NULL,
    "connectionId" TEXT,
    "contactEmail" TEXT,
    "phone" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ChurchContactAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurchAuditEvent" (
    "id" TEXT NOT NULL,
    "churchId" TEXT,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT,
    "version" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChurchAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Church_slug_key" ON "Church"("slug");

-- CreateIndex
CREATE INDEX "ChurchConnection_churchId_state_idx" ON "ChurchConnection"("churchId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchConnection_userId_churchId_key" ON "ChurchConnection"("userId", "churchId");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchCapabilityGrant_userId_churchId_capability_key" ON "ChurchCapabilityGrant"("userId", "churchId", "capability");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformOperatorGrant_userId_capability_key" ON "PlatformOperatorGrant"("userId", "capability");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchContactAssignment_churchId_slot_key" ON "ChurchContactAssignment"("churchId", "slot");

-- CreateIndex
CREATE INDEX "ChurchAuditEvent_churchId_createdAt_idx" ON "ChurchAuditEvent"("churchId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChurchConnection" ADD CONSTRAINT "ChurchConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchConnection" ADD CONSTRAINT "ChurchConnection_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchDirectoryPreference" ADD CONSTRAINT "ChurchDirectoryPreference_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ChurchConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchCapabilityGrant" ADD CONSTRAINT "ChurchCapabilityGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchCapabilityGrant" ADD CONSTRAINT "ChurchCapabilityGrant_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchCapabilityGrant" ADD CONSTRAINT "ChurchCapabilityGrant_dependencyConnectionId_fkey" FOREIGN KEY ("dependencyConnectionId") REFERENCES "ChurchConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformOperatorGrant" ADD CONSTRAINT "PlatformOperatorGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchContactAssignment" ADD CONSTRAINT "ChurchContactAssignment_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchContactAssignment" ADD CONSTRAINT "ChurchContactAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchContactAssignment" ADD CONSTRAINT "ChurchContactAssignment_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ChurchConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchAuditEvent" ADD CONSTRAINT "ChurchAuditEvent_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One active relationship in total, not separate pending/approved uniqueness.
CREATE UNIQUE INDEX "ChurchConnection_one_active_user" ON "ChurchConnection" ("userId") WHERE "state" IN ('PENDING', 'APPROVED');
ALTER TABLE "ChurchConnection" ADD CONSTRAINT "ChurchConnection_positive_version" CHECK ("version" > 0);
ALTER TABLE "ChurchContactAssignment" ADD CONSTRAINT "ChurchContactAssignment_membership_required" CHECK (("slot" = 'RELATIONSHIP_OWNER' AND "connectionId" IS NULL) OR ("slot" <> 'RELATIONSHIP_OWNER' AND "connectionId" IS NOT NULL));
