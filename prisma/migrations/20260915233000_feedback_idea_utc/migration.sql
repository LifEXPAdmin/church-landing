-- These Prisma timestamp columns store UTC without a zone. The session zone
-- must not defer publication or backdate its auditable status history.
ALTER TABLE "FeedbackIdea" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "FeedbackIdeaVote" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "FeedbackIdeaSubscription" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "FeedbackIdeaEvent" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
CREATE OR REPLACE FUNCTION gc_feedback_idea_privacy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT NEW."allowIdea" OR NEW."redactedAt" IS NOT NULL THEN
   UPDATE "FeedbackIdea" SET "withdrawnAt"=coalesce("withdrawnAt",CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),version=version+1,"updatedAt"=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
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
