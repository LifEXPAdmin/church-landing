-- Existing shifts start at migration time, preventing retroactive reminders.
ALTER TABLE "PostVolunteerSlot" ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
