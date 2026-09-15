ALTER TABLE "PlatformMeasurementChoice" ADD COLUMN "cohortEligible" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "onboardingStartedAt" TIMESTAMP(3), ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3), ADD COLUMN "onboardingSkippedAt" TIMESTAMP(3);
ALTER TABLE "PlatformMeasurementChoice" ADD CONSTRAINT "PlatformMeasurementChoice_session_values_check" CHECK (array_position("sessionStarts",NULL) IS NULL);
CREATE OR REPLACE FUNCTION gc_metric_choice_clear_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."enabledAt" IS NULL THEN
  NEW."sessionStarts":=ARRAY[]::TIMESTAMP(3)[]; NEW."eligibleSessions":=0; NEW."cohortEligible":=false;
  NEW."onboardingStartedAt":=NULL; NEW."onboardingCompletedAt":=NULL; NEW."onboardingSkippedAt":=NULL;
 END IF;
 RETURN NEW;
END $$;
