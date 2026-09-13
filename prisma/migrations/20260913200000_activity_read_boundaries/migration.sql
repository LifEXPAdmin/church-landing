-- Personal activity state lives on existing recipient intents/preferences.
-- Sequence allocation occurs inside the existing lifecycle writer gate. Wall
-- clock timestamps are not read boundaries, including for delayed commits.
BEGIN;
ALTER TABLE "SocialEvent"
  ADD COLUMN "activitySequence" BIGSERIAL NOT NULL,
  ADD COLUMN "activityReadAt" TIMESTAMP(3);
-- Older snapshots receive deterministic historical order. The DDL lock prevents
-- concurrent event allocation until the sequence and unique index agree.
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS position
  FROM "SocialEvent"
)
UPDATE "SocialEvent" e SET "activitySequence" = ordered.position
FROM ordered WHERE ordered.id = e.id;
SELECT setval(pg_get_serial_sequence('"SocialEvent"', 'activitySequence'),
  greatest(coalesce(max("activitySequence"), 0), 1), count(*) > 0)
FROM "SocialEvent";
CREATE UNIQUE INDEX "SocialEvent_recipientId_activitySequence_key"
  ON "SocialEvent"("recipientId", "activitySequence");
ALTER TABLE "SocialPreferences"
  ADD COLUMN "activityReadThrough" BIGINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT "SocialPreferences_activity_read_boundary"
    CHECK ("activityReadThrough" >= 0);
COMMIT;
