-- Optional opportunity-scoped availability and separate, default-Off shift reminders.
ALTER TABLE "VolunteerApplication" ADD COLUMN "availability" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SocialPreferences" ADD COLUMN "volunteerReminderMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SocialPreferences" ADD COLUMN "volunteerReminderSince" TIMESTAMPTZ(3);
