CREATE TABLE "AccountDeletion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "proofHash" TEXT NOT NULL UNIQUE,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "policy" TEXT NOT NULL,
  "structuredPurgedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "journaledAt" TIMESTAMP(3),
  "completionJournaledAt" TIMESTAMP(3),
  "exceptions" JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX "AccountDeletion_completedAt_dueAt_idx" ON "AccountDeletion"("completedAt", "dueAt");
-- Permanent closure cannot be undone by an old application or recovery path.
CREATE FUNCTION guard_permanent_account_closure() RETURNS trigger AS $$
BEGIN
  IF OLD."deletionRequestedAt" IS NOT NULL AND
    (NEW."deletionRequestedAt" IS DISTINCT FROM OLD."deletionRequestedAt" OR NEW."deactivatedAt" IS NULL) THEN
    RAISE EXCEPTION 'Permanent account closure cannot be reactivated';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER guard_permanent_account_closure BEFORE UPDATE ON "PlatformUser"
FOR EACH ROW EXECUTE FUNCTION guard_permanent_account_closure();

CREATE FUNCTION guard_account_deletion_clock() RETURNS trigger AS $$
BEGIN
  IF NEW."userId" <> OLD."userId" OR NEW."proofHash" <> OLD."proofHash" OR
    NEW."requestedAt" <> OLD."requestedAt" OR NEW."dueAt" <> OLD."dueAt" OR
    NEW.policy <> OLD.policy OR
    (OLD."completedAt" IS NOT NULL AND NEW."completedAt" IS DISTINCT FROM OLD."completedAt") THEN
    RAISE EXCEPTION 'Verified deletion scope and clocks are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER guard_account_deletion_clock BEFORE UPDATE ON "AccountDeletion"
FOR EACH ROW EXECUTE FUNCTION guard_account_deletion_clock();
