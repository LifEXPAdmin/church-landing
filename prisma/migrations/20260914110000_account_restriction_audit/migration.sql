-- Existing audit rows retain their original meaning; no reason is invented.
ALTER TABLE "ChurchAuditEvent" ADD COLUMN "reason" TEXT;

-- Account restrictions use the existing content-free protected control journal.
-- Account erasure retains its separate canonical deletion records and journal.
ALTER TYPE "RetentionTarget" ADD VALUE 'ACCOUNT';

-- Account recovery controls share the ledger, not message/report purge authority.
ALTER TABLE "RetentionHold" ADD CONSTRAINT "RetentionHold_message_report_only"
  CHECK ("target"::text IN ('MESSAGE', 'REPORT'));
ALTER TABLE "RetentionPurge" ADD CONSTRAINT "RetentionPurge_message_report_only"
  CHECK ("target"::text IN ('MESSAGE', 'REPORT'));
ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_kind_check";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_kind_check"
  CHECK (kind IN ('REPORT','HOLD','MODERATION_POST','MODERATION_COMMENT','APPEAL','AUTHOR_WITHDRAW_POST','AUTHOR_WITHDRAW_COMMENT','ACCOUNT_STATE'));
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_account_scope"
  CHECK ((kind = 'ACCOUNT_STATE' AND target::text = 'ACCOUNT' AND "sourceId" = "targetId")
    OR (kind <> 'ACCOUNT_STATE' AND target::text <> 'ACCOUNT'));
