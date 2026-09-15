ALTER TABLE "FeedbackIdeaSubscription" ADD COLUMN id TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text);
CREATE UNIQUE INDEX "FeedbackIdeaSubscription_id_key" ON "FeedbackIdeaSubscription"(id);
ALTER TABLE "FeedbackIdeaSubscription" ALTER COLUMN id DROP DEFAULT;
ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_kind_check";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_kind_check" CHECK (
 kind IN ('REPORT','HOLD','MODERATION_POST','MODERATION_COMMENT','MODERATION_TOPIC',
 'TOPIC_ACCESS','POST_DISCOVERY','DISCOVERY_PREFERENCES','NOTIFICATION_PREFERENCES',
 'AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','APPEAL','ACCOUNT_STATE',
 'AUTHOR_WITHDRAW_POST','AUTHOR_WITHDRAW_COMMENT','SUPPORT_MESSAGE','SUPPORT_ATTACHMENT','FEEDBACK_PROMPT',
 'FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION'));
ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_account_scope";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_account_scope" CHECK (
 (kind IN ('ACCOUNT_STATE','FEEDBACK_PROMPT') AND target::text='ACCOUNT' AND "sourceId"="targetId")
 OR (kind IN ('TOPIC_ACCESS','POST_DISCOVERY','DISCOVERY_PREFERENCES','NOTIFICATION_PREFERENCES','AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION') AND target::text='ACCOUNT')
 OR (kind NOT IN ('ACCOUNT_STATE','FEEDBACK_PROMPT','TOPIC_ACCESS','POST_DISCOVERY','DISCOVERY_PREFERENCES','NOTIFICATION_PREFERENCES','AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION') AND target::text<>'ACCOUNT'));

-- Publication withdrawal requires another explicit human review before the
-- public copy can return. Name-attribution withdrawal alone does not retract it.
CREATE FUNCTION gc_feedback_idea_privacy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT NEW."allowIdea" OR NEW."redactedAt" IS NOT NULL THEN
   UPDATE "FeedbackIdea" SET "withdrawnAt"=coalesce("withdrawnAt",CURRENT_TIMESTAMP),version=version+1,"updatedAt"=CURRENT_TIMESTAMP
     WHERE "sourceCaseId"=NEW."caseId" AND "withdrawnAt" IS NULL;
 END IF;
 IF NEW."redactedAt" IS NOT NULL THEN
   UPDATE "FeedbackIdea" SET title='Content removed for privacy',summary='[Removed for privacy.]',explanation='[Removed for privacy.]'
     WHERE "sourceCaseId"=NEW."caseId";
   UPDATE "FeedbackIdeaEvent" SET explanation='[Removed for privacy.]'
     WHERE "ideaId" IN (SELECT id FROM "FeedbackIdea" WHERE "sourceCaseId"=NEW."caseId");
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER gc_feedback_idea_privacy AFTER UPDATE OF "allowIdea","redactedAt" ON "FeedbackSubmission"
 FOR EACH ROW EXECUTE FUNCTION gc_feedback_idea_privacy();
