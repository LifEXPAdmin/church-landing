BEGIN;

-- Preserve old rows as an explicit bounded legacy exception. No trustworthy
-- interaction history exists to backfill. The application adopts idle protection
-- on deliberate foreground activity and rejects remaining null rows at cutoff.
ALTER TABLE "PlatformSession" ADD COLUMN "idleExpiresAt" TIMESTAMP(3);

-- New inserts, including a briefly older application during rollout, receive
-- an idle deadline. Use UTC explicitly because this column has no time zone.
ALTER TABLE "PlatformSession" ALTER COLUMN "idleExpiresAt"
  SET DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '30 minutes');

CREATE INDEX "PlatformSession_idleExpiresAt_idx" ON "PlatformSession"("idleExpiresAt");

COMMIT;
