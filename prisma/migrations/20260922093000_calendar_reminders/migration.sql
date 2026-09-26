ALTER TABLE "SocialPreferences"
  ADD COLUMN "calendarReminderMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "calendarReminderSince" TIMESTAMPTZ(3);
ALTER TABLE "SocialPreferences" ADD CONSTRAINT "SocialPreferences_calendar_reminder_choice"
  CHECK (("calendarReminderMinutes" = 0 AND "calendarReminderSince" IS NULL)
    OR ("calendarReminderMinutes" IN (15, 60) AND "calendarReminderSince" IS NOT NULL));

CREATE TABLE "CalendarReminderJob" (
  "ownerId" TEXT NOT NULL PRIMARY KEY,
  "version" INTEGER NOT NULL DEFAULT 1,
  "wakeAt" TIMESTAMPTZ(3),
  "throughAt" TIMESTAMPTZ(3) NOT NULL,
  "throughId" TEXT NOT NULL DEFAULT '',
  "dispatchedAt" TIMESTAMP(3),
  "dispatchClaimedAt" TIMESTAMP(3),
  "dispatchAttempts" INTEGER NOT NULL DEFAULT 0,
  "lastDispatchErrorAt" TIMESTAMP(3),
  CONSTRAINT "CalendarReminderJob_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CalendarReminderJob_bounds" CHECK ("version" > 0 AND "dispatchAttempts" >= 0 AND length("throughId") <= 80)
);
CREATE INDEX "CalendarReminderJob_wakeAt_dispatchedAt_idx" ON "CalendarReminderJob"("wakeAt", "dispatchedAt");
