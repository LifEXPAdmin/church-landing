ALTER TABLE "SocialPreferences"
  ADD COLUMN "hideAuthoredReactionCounts" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reactionCountVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reactionCountRecoveryRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT "SocialPreferences_reactionCountVersion_nonnegative"
    CHECK ("reactionCountVersion" >= 0);
