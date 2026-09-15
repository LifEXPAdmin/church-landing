ALTER TABLE "CommunityReport" ADD COLUMN "assignedReviewerProof" TEXT;
ALTER TABLE "ChurchClaim" ADD COLUMN "assignedReviewerProof" TEXT;
CREATE INDEX "CommunityReport_assignedReviewerId_idx" ON "CommunityReport"("assignedReviewerId");
CREATE INDEX "ChurchClaim_assignedReviewerId_idx" ON "ChurchClaim"("assignedReviewerId");
