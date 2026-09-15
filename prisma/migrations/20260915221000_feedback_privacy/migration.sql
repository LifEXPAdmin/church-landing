-- All existing local feedback was submitted under this first explicit notice.
ALTER TABLE "FeedbackSubmission" ADD COLUMN notice TEXT NOT NULL DEFAULT 'confidential-feedback-v1';
ALTER TABLE "FeedbackSubmission" ADD CONSTRAINT "Feedback_notice_version" CHECK (notice='confidential-feedback-v1');

ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_kind_check";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_kind_check" CHECK (
  kind IN ('REPORT','HOLD','MODERATION_POST','MODERATION_COMMENT','MODERATION_TOPIC',
    'TOPIC_ACCESS','POST_DISCOVERY','DISCOVERY_PREFERENCES','NOTIFICATION_PREFERENCES',
    'AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','APPEAL','ACCOUNT_STATE',
    'AUTHOR_WITHDRAW_POST','AUTHOR_WITHDRAW_COMMENT','SUPPORT_MESSAGE'));
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_support_message_target" CHECK (
  kind<>'SUPPORT_MESSAGE' OR target::text='MESSAGE');
