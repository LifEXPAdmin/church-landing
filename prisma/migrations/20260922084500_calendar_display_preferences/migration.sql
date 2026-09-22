ALTER TABLE "PlatformUser"
  ADD COLUMN "calendarWeekStart" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "calendarDefaultView" TEXT NOT NULL DEFAULT 'AGENDA',
  ADD COLUMN "calendarTimeZoneMode" TEXT NOT NULL DEFAULT 'FIXED',
  ADD COLUMN "calendarDisplayTimeZone" TEXT NOT NULL DEFAULT 'UTC';

ALTER TABLE "PlatformUser" ADD CONSTRAINT "PlatformUser_calendar_display_bounds"
  CHECK ("calendarWeekStart" IN (0, 1)
    AND "calendarDefaultView" IN ('AGENDA', 'MONTH')
    AND "calendarTimeZoneMode" IN ('FIXED', 'DEVICE')
    AND length("calendarDisplayTimeZone") BETWEEN 1 AND 100
    AND "calendarDisplayTimeZone" = btrim("calendarDisplayTimeZone"));

-- The existing regional version and exact command receipts own these personal
-- presentation choices. No calendar, event instant, sharing or consent changes.
