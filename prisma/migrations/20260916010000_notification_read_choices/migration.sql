-- Personal reminder state is separate from delivery suppression and message reads.
ALTER TABLE "SocialEvent" ADD COLUMN "activityMarkedUnreadAt" TIMESTAMP(3);
