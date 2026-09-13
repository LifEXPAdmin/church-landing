CREATE TABLE "RetentionControl" (
  id TEXT NOT NULL PRIMARY KEY,
  target "RetentionTarget" NOT NULL,
  "targetId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('REPORT','HOLD')),
  version INTEGER NOT NULL CHECK (version > 0),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "journaledAt" TIMESTAMP(3),
  UNIQUE(kind, "sourceId", version)
);
CREATE INDEX "RetentionControl_journaledAt_createdAt_id_idx" ON "RetentionControl"("journaledAt", "createdAt", id);
CREATE INDEX "RetentionControl_target_targetId_idx" ON "RetentionControl"(target, "targetId");
CREATE FUNCTION guard_retention_control() RETURNS trigger AS $$
BEGIN
  IF ROW(NEW.id, NEW.target, NEW."targetId", NEW."sourceId", NEW.kind, NEW.version, NEW.payload, NEW."createdAt")
    IS DISTINCT FROM ROW(OLD.id, OLD.target, OLD."targetId", OLD."sourceId", OLD.kind, OLD.version, OLD.payload, OLD."createdAt")
    OR (OLD."journaledAt" IS NOT NULL AND NEW."journaledAt" IS DISTINCT FROM OLD."journaledAt") THEN
    RAISE EXCEPTION 'A protected retention control decision is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER guard_retention_control BEFORE UPDATE ON "RetentionControl"
FOR EACH ROW EXECUTE FUNCTION guard_retention_control();
ALTER TABLE "AccountDeletion" ADD COLUMN "lastAttemptAt" TIMESTAMP(3);
CREATE INDEX "AccountDeletion_lastAttemptAt_dueAt_idx" ON "AccountDeletion"("lastAttemptAt", "dueAt");
ALTER TABLE "RetentionPurge" ADD COLUMN "lastAttemptAt" TIMESTAMP(3);
