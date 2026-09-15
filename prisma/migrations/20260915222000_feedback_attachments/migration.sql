ALTER TYPE "MediaPurpose" ADD VALUE 'SUPPORT_ATTACHMENT';
ALTER TYPE "RetentionTarget" ADD VALUE 'ASSET';
ALTER TABLE "MediaAsset" ADD COLUMN "feedbackOwnerId" TEXT,
  ADD COLUMN "feedbackCaseId" TEXT;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_feedbackOwnerId_fkey"
  FOREIGN KEY ("feedbackOwnerId") REFERENCES "PlatformUser"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_feedbackCaseId_fkey"
  FOREIGN KEY ("feedbackCaseId") REFERENCES "FeedbackSubmission"("caseId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" DROP CONSTRAINT "MediaAsset_target";
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_target" CHECK (
  ("feedbackOwnerId" IS NULL AND "feedbackCaseId" IS NULL AND (
    (purpose::text IN ('PROFILE_AVATAR','PROFILE_COVER','PROFILE_PHOTO') AND "profileUserId" IS NOT NULL AND "churchId" IS NULL AND "postId" IS NULL)
    OR (purpose::text IN ('CHURCH_LOGO','CHURCH_COVER') AND "churchId" IS NOT NULL AND "profileUserId" IS NULL AND "postId" IS NULL)
    OR (purpose::text='POST_PHOTO' AND "postId" IS NOT NULL AND "profileUserId" IS NULL AND "churchId" IS NULL)))
  OR (purpose::text='SUPPORT_ATTACHMENT' AND "feedbackOwnerId" IS NOT NULL AND "feedbackOwnerId"="uploaderId"
    AND "profileUserId" IS NULL AND "churchId" IS NULL AND "postId" IS NULL AND "replacesId" IS NULL AND crop IS NULL)
);
CREATE INDEX "MediaAsset_feedbackOwnerId_feedbackCaseId_status_idx" ON "MediaAsset"("feedbackOwnerId","feedbackCaseId",status);
CREATE INDEX "MediaAsset_feedbackCaseId_status_position_idx" ON "MediaAsset"("feedbackCaseId",status,position);
CREATE FUNCTION protect_feedback_attachment_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD."feedbackCaseId" IS NOT NULL AND NEW."feedbackCaseId" IS DISTINCT FROM OLD."feedbackCaseId" THEN
    RAISE EXCEPTION 'A private attachment cannot move between cases';
  END IF;
  IF NEW."feedbackCaseId" IS NOT NULL AND (TG_OP='INSERT' OR NEW."feedbackCaseId" IS DISTINCT FROM OLD."feedbackCaseId") THEN
    IF NEW.status::text<>'READY' OR NOT EXISTS (
      SELECT 1 FROM "FeedbackSubmission" f JOIN "SupportCase" s ON s.id=f."caseId"
      WHERE f."caseId"=NEW."feedbackCaseId" AND s."requesterId"=NEW."feedbackOwnerId" AND f."redactedAt" IS NULL
    ) THEN RAISE EXCEPTION 'A private attachment requires its current owned feedback receipt'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "MediaAsset_feedback_binding" BEFORE INSERT OR UPDATE ON "MediaAsset"
  FOR EACH ROW EXECUTE FUNCTION protect_feedback_attachment_binding();
ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_kind_check";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_kind_check" CHECK (
  kind IN ('REPORT','HOLD','MODERATION_POST','MODERATION_COMMENT','MODERATION_TOPIC',
    'TOPIC_ACCESS','POST_DISCOVERY','DISCOVERY_PREFERENCES','NOTIFICATION_PREFERENCES',
    'AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','APPEAL','ACCOUNT_STATE',
    'AUTHOR_WITHDRAW_POST','AUTHOR_WITHDRAW_COMMENT','SUPPORT_MESSAGE','SUPPORT_ATTACHMENT'));
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_support_attachment_target" CHECK (
  (kind='SUPPORT_ATTACHMENT')=(target::text='ASSET'));
