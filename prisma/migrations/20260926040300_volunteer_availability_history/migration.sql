-- Availability changes use the same versioned, text-free application history.
ALTER TABLE "VolunteerApplicationEvent" DROP CONSTRAINT "VolunteerApplicationEvent_bounds";
ALTER TABLE "VolunteerApplicationEvent" ADD CONSTRAINT "VolunteerApplicationEvent_bounds"
CHECK (version > 0 AND length(note) <= 500
  AND action IN ('SUBMITTED','WITHDRAWN','DECLINED','ACCEPTED','CANCELED','AVAILABILITY_UPDATED'));
