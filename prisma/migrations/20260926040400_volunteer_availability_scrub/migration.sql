-- Compatible older writers do not know the optional availability column.
-- Scrub it before ownership is removed or the application is quarantined/ended.
CREATE FUNCTION volunteer_availability_scrub() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."userId" IS NULL OR NEW."recoveryRequired" OR NEW.state IN ('WITHDRAWN','DECLINED') THEN
    NEW.availability := '';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER volunteer_availability_scrub BEFORE INSERT OR UPDATE ON "VolunteerApplication"
FOR EACH ROW EXECUTE FUNCTION volunteer_availability_scrub();
UPDATE "VolunteerApplication" SET availability=''
WHERE "userId" IS NULL OR "recoveryRequired" OR state IN ('WITHDRAWN','DECLINED');

-- A compatible older recovery writer must not preserve unseen shift consent.
CREATE FUNCTION volunteer_reminder_recovery_scrub() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."notificationRecoveryRequired" THEN
    NEW."volunteerReminderMinutes" := 0;
    NEW."volunteerReminderSince" := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER volunteer_reminder_recovery_scrub BEFORE INSERT OR UPDATE ON "SocialPreferences"
FOR EACH ROW EXECUTE FUNCTION volunteer_reminder_recovery_scrub();
UPDATE "SocialPreferences" SET "volunteerReminderMinutes"=0, "volunteerReminderSince"=NULL
WHERE "notificationRecoveryRequired";
