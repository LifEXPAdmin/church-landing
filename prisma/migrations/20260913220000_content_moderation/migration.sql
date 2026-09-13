BEGIN;
CREATE TYPE "ContentModerationState" AS ENUM ('VISIBLE', 'HIDDEN', 'REMOVED');
ALTER TABLE "PlatformPost" ADD COLUMN "moderationState" "ContentModerationState" NOT NULL DEFAULT 'VISIBLE';
ALTER TABLE "PlatformPostComment" ADD COLUMN "moderationState" "ContentModerationState" NOT NULL DEFAULT 'VISIBLE';
ALTER TABLE "PlatformPostComment" DROP CONSTRAINT "PlatformPostComment_thread_shape";
ALTER TABLE "PlatformPostComment" ADD CONSTRAINT "PlatformPostComment_thread_shape" CHECK (
  version > 0 AND (("parentId" IS NULL AND "rootId" IS NULL) OR ("parentId" IS NOT NULL AND "rootId" IS NOT NULL AND id <> "parentId" AND id <> "rootId"))
);
CREATE FUNCTION reported_comment_retention() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."deletedAt" IS NOT NULL AND NEW.content <> '' AND NOT EXISTS (
    SELECT 1 FROM "CommunityReport" WHERE "targetType" = 'COMMENT' AND "targetId" = NEW.id
  ) THEN
    RAISE EXCEPTION 'Deleted comment text requires a selected report' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PlatformPostComment_reported_retention" BEFORE INSERT OR UPDATE OF content, "deletedAt" ON "PlatformPostComment" FOR EACH ROW EXECUTE FUNCTION reported_comment_retention();
ALTER TABLE "CommunityReportDecision"
  ADD COLUMN "action" TEXT,
  ADD COLUMN "authorReason" TEXT,
  ADD COLUMN "authorId" TEXT,
  ADD COLUMN "authorChurchId" TEXT,
  ADD COLUMN "fromVisibility" TEXT,
  ADD COLUMN "toVisibility" TEXT,
  ADD COLUMN "sourceVersion" INTEGER,
  ADD COLUMN "contextVersion" INTEGER;
CREATE INDEX "CommunityReportDecision_authorId_createdAt_id_idx" ON "CommunityReportDecision"("authorId", "createdAt", "id");
CREATE INDEX "CommunityReportDecision_authorChurchId_createdAt_id_idx" ON "CommunityReportDecision"("authorChurchId", "createdAt", "id");
ALTER TABLE "SupportCase" ADD COLUMN "moderationDecisionId" TEXT;
CREATE UNIQUE INDEX "SupportCase_moderationDecisionId_key" ON "SupportCase"("moderationDecisionId");
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_moderationDecisionId_fkey" FOREIGN KEY ("moderationDecisionId") REFERENCES "CommunityReportDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_moderation_owner_check" CHECK ("moderationDecisionId" IS NULL OR ("ownerGrantId" IS NULL AND "ownerGrantVersion" IS NULL AND "churchId" IS NULL AND category = 'ACCOUNT_WEBSITE'));
ALTER TABLE "SocialEvent" ADD COLUMN "decisionId" TEXT;
ALTER TABLE "SocialEvent" DROP CONSTRAINT "SocialEvent_source_shape";
ALTER TABLE "SocialEvent" ADD CONSTRAINT "SocialEvent_source_shape" CHECK (
 ("kind" NOT IN ('PUSH_TEST','REPORT_RECEIVED','REPORT_RECONSIDERATION','CONTENT_DECISION') AND "kind" NOT LIKE 'ADULT_%' AND "postId" IS NOT NULL AND "commentId" IS NOT NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL)
 OR ("kind" = 'ADULT_REQUEST_CREATED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NOT NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'ADULT_REQUEST_ACCEPTED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NOT NULL AND "conversationId" IS NOT NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'ADULT_MESSAGE_CREATED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NOT NULL AND "messageId" IS NOT NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" IN ('REPORT_RECEIVED','REPORT_RECONSIDERATION') AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NOT NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'CONTENT_DECISION' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NOT NULL AND "decisionId" IS NOT NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'PUSH_TEST' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" = "actorId" AND "recipientId" IS NOT NULL));
DROP INDEX "SocialEvent_one_report_recipient";
CREATE UNIQUE INDEX "SocialEvent_one_report_recipient" ON "SocialEvent"("reportId", "recipientId") WHERE kind = 'REPORT_RECEIVED';
CREATE UNIQUE INDEX "SocialEvent_one_decision_recipient" ON "SocialEvent"("decisionId", "recipientId") WHERE kind = 'CONTENT_DECISION';
ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_kind_check";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_kind_check" CHECK (kind IN ('REPORT','HOLD','MODERATION_POST','MODERATION_COMMENT','APPEAL','AUTHOR_WITHDRAW_POST','AUTHOR_WITHDRAW_COMMENT'));
COMMIT;
