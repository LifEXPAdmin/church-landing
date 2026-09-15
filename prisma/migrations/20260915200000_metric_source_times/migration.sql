-- Canonical successful-state times, not an event log. Unknown history stays NULL.
ALTER TABLE "SocialRelationship" ADD COLUMN "followingSince" TIMESTAMP(3);
ALTER TABLE "TopicMembership" ADD COLUMN "followingSince" TIMESTAMP(3);
ALTER TABLE "CalendarResponse" ADD COLUMN "goingSince" TIMESTAMP(3);
ALTER TABLE "PostVolunteerSignup" ADD COLUMN "activeSince" TIMESTAMP(3);
ALTER TABLE "ChurchConnection" ADD COLUMN "requestedAt" TIMESTAMP(3), ADD COLUMN "approvedSince" TIMESTAMP(3);

CREATE FUNCTION gc_current_success_time() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE active boolean; was_active boolean;
BEGIN
  active := (to_jsonb(NEW)->>TG_ARGV[0]) = TG_ARGV[1];
  was_active := TG_OP='UPDATE' AND (to_jsonb(OLD)->>TG_ARGV[0]) = TG_ARGV[1];
  NEW := jsonb_populate_record(NEW, jsonb_build_object(TG_ARGV[2],
    CASE WHEN NOT active THEN NULL
      WHEN was_active THEN to_jsonb(OLD)->TG_ARGV[2]
      ELSE to_jsonb(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') END));
  RETURN NEW;
END $$;
CREATE TRIGGER gc_church_follow_time BEFORE INSERT OR UPDATE ON "SocialRelationship"
  FOR EACH ROW EXECUTE FUNCTION gc_current_success_time('followingChurch','true','followingSince');
CREATE TRIGGER gc_topic_follow_time BEFORE INSERT OR UPDATE ON "TopicMembership"
  FOR EACH ROW EXECUTE FUNCTION gc_current_success_time('following','true','followingSince');
CREATE TRIGGER gc_event_going_time BEFORE INSERT OR UPDATE ON "CalendarResponse"
  FOR EACH ROW EXECUTE FUNCTION gc_current_success_time('state','GOING','goingSince');
CREATE TRIGGER gc_volunteer_time BEFORE INSERT OR UPDATE ON "PostVolunteerSignup"
  FOR EACH ROW EXECUTE FUNCTION gc_current_success_time('state','ACTIVE','activeSince');

CREATE FUNCTION gc_connection_success_times() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' OR NEW.state IS DISTINCT FROM OLD.state THEN
    IF NEW.state='PENDING' THEN
      NEW."requestedAt" := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
    ELSIF NEW.state <> 'APPROVED' THEN
      NEW."requestedAt" := NULL;
    ELSIF TG_OP='INSERT' THEN
      NEW."requestedAt" := NULL;
    END IF;
    NEW."approvedSince" := CASE WHEN NEW.state='APPROVED' THEN CURRENT_TIMESTAMP AT TIME ZONE 'UTC' ELSE NULL END;
  ELSE
    NEW."requestedAt" := OLD."requestedAt";
    NEW."approvedSince" := OLD."approvedSince";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gc_connection_times BEFORE INSERT OR UPDATE ON "ChurchConnection"
  FOR EACH ROW EXECUTE FUNCTION gc_connection_success_times();
