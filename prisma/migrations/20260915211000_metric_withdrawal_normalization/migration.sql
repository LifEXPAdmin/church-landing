-- Every trusted withdrawal, including operational assignment, clears the complete
-- optional choice shape before its off-state CHECK and daily-fact cleanup run.
CREATE OR REPLACE FUNCTION gc_metric_choice_clear_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."enabledAt" IS NULL THEN
  NEW."shareDevice":=false; NEW.referral:='UNKNOWN'; NEW."lastForegroundAt":=NULL;
  NEW."sessionStarts":=ARRAY[]::TIMESTAMP(3)[]; NEW."eligibleSessions":=0; NEW."cohortEligible":=false;
  NEW."onboardingStartedAt":=NULL; NEW."onboardingCompletedAt":=NULL; NEW."onboardingSkippedAt":=NULL;
 END IF;
 RETURN NEW;
END $$;
