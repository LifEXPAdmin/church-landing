ALTER TABLE "PlatformUser" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3), ADD COLUMN "erasedAt" TIMESTAMP(3);
ALTER TABLE "CommunityReport" ADD COLUMN "closedAt" TIMESTAMP(3), ADD COLUMN "reviewDueAt" TIMESTAMP(3) NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + interval '30 days');
UPDATE "CommunityReport" SET "closedAt" = "updatedAt" WHERE status = 'CLOSED';
CREATE INDEX "CommunityReport_closedAt_idx" ON "CommunityReport"("closedAt");
CREATE INDEX "CommunityReport_reviewDueAt_idx" ON "CommunityReport"("reviewDueAt");
ALTER TABLE "AdultMessage" ADD COLUMN "unretainedAt" TIMESTAMP(3);
CREATE INDEX "AdultMessage_unretainedAt_idx" ON "AdultMessage"("unretainedAt");
CREATE TYPE "RetentionTarget" AS ENUM ('MESSAGE', 'REPORT');
CREATE TABLE "RetentionHold" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "target" "RetentionTarget" NOT NULL,
  "targetId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "reason" TEXT NOT NULL,
  "operatorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewDueAt" TIMESTAMP(3) NOT NULL,
  "releasedAt" TIMESTAMP(3),
  CONSTRAINT "RetentionHold_version_check" CHECK ("version" > 0),
  CONSTRAINT "RetentionHold_reason_check" CHECK (length("reason") BETWEEN 5 AND 1000)
);
CREATE INDEX "RetentionHold_target_targetId_releasedAt_idx" ON "RetentionHold"("target", "targetId", "releasedAt");
CREATE INDEX "RetentionHold_reviewDueAt_idx" ON "RetentionHold"("reviewDueAt");
CREATE TABLE "RetentionHoldEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "holdId" TEXT NOT NULL REFERENCES "RetentionHold"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "operatorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RetentionHoldEvent_action_check" CHECK ("action" IN ('PRESERVE','REVIEW','RELEASE'))
);
CREATE INDEX "RetentionHoldEvent_holdId_createdAt_idx" ON "RetentionHoldEvent"("holdId", "createdAt");
CREATE TABLE "RetentionPurge" (
  "target" "RetentionTarget" NOT NULL,
  "targetId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "policy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "journaledAt" TIMESTAMP(3),
  PRIMARY KEY ("target", "targetId")
);
CREATE INDEX "RetentionPurge_completedAt_idx" ON "RetentionPurge"("completedAt");
