CREATE TABLE "FeedbackPromptPreference" (
  "userId" TEXT PRIMARY KEY REFERENCES "PlatformUser"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
  "neverAskAt" TIMESTAMP(3), "shownUntil" TIMESTAMP(3),
  "dismissedUntil" TIMESTAMP(3), "respondedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "FeedbackPromptClaim" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "PlatformUser"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  campaign TEXT NOT NULL CHECK (length(campaign) BETWEEN 1 AND 80),
  "measurementVersion" INTEGER NOT NULL CHECK ("measurementVersion">0),
  "configurationVersion" INTEGER NOT NULL CHECK ("configurationVersion">0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "shownAt" TIMESTAMP(3), "finishedAt" TIMESTAMP(3),
  CHECK ("expiresAt">"createdAt" AND ("shownAt" IS NULL OR "shownAt">="createdAt"))
);
CREATE UNIQUE INDEX "FeedbackPromptClaim_one_unfinished_account" ON "FeedbackPromptClaim"("userId") WHERE "finishedAt" IS NULL;
CREATE INDEX "FeedbackPromptClaim_userId_createdAt_idx" ON "FeedbackPromptClaim"("userId","createdAt");
CREATE INDEX "FeedbackPromptClaim_createdAt_idx" ON "FeedbackPromptClaim"("createdAt");
ALTER TABLE "FeedbackSubmission" ADD COLUMN "promptClaimId" TEXT REFERENCES "FeedbackPromptClaim"(id) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "FeedbackSubmission_promptClaimId_key" ON "FeedbackSubmission"("promptClaimId");
ALTER TABLE "FeedbackSubmission" ADD CONSTRAINT "Feedback_prompt_entry" CHECK ("promptClaimId" IS NULL OR "entryPoint"='PROMPT');

-- Every collection withdrawal, including operational assignment, removes raw
-- reservations/exposures. The account's refusal and cooldowns remain in force.
CREATE FUNCTION gc_feedback_prompt_withdrawal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."enabledAt" IS NULL THEN DELETE FROM "FeedbackPromptClaim" WHERE "userId"=NEW."userId"; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER gc_feedback_prompt_withdrawal AFTER INSERT OR UPDATE OF "enabledAt" ON "PlatformMeasurementChoice"
 FOR EACH ROW EXECUTE FUNCTION gc_feedback_prompt_withdrawal();

ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_kind_check";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_kind_check" CHECK (
 kind IN ('REPORT','HOLD','MODERATION_POST','MODERATION_COMMENT','MODERATION_TOPIC',
 'TOPIC_ACCESS','POST_DISCOVERY','DISCOVERY_PREFERENCES','NOTIFICATION_PREFERENCES',
 'AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','APPEAL','ACCOUNT_STATE',
 'AUTHOR_WITHDRAW_POST','AUTHOR_WITHDRAW_COMMENT','SUPPORT_MESSAGE','SUPPORT_ATTACHMENT','FEEDBACK_PROMPT'));
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_feedback_prompt_target" CHECK (
 kind<>'FEEDBACK_PROMPT' OR (target::text='ACCOUNT' AND "sourceId"="targetId"));
