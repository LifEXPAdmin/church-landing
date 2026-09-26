-- Extend the existing source-shape constraint without weakening earlier kinds.
ALTER TABLE "SocialEvent" DROP CONSTRAINT "SocialEvent_source_shape";
ALTER TABLE "SocialEvent" ADD CONSTRAINT "SocialEvent_source_shape" CHECK (
 ("kind" NOT IN ('CALENDAR_REMINDER','VOLUNTEER_REMINDER','PUSH_TEST','REPORT_RECEIVED','REPORT_RECONSIDERATION','CONTENT_DECISION','AUTHOR_POST','POST_MENTION','POST_REACTION','COMMENT_REACTION','PRAYER_ACK','CHURCH_REVIEW','CHURCH_CONNECTION','CHURCH_ROLE','CHURCH_CAPABILITY','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CHANGED','VOLUNTEER_REQUEST','VOLUNTEER_CONFIRMATION','FEEDBACK_CASE','FEEDBACK_IDEA','PHOTO_TAG_REQUEST','PHOTO_TAG_APPROVED','FRIEND_CONNECTED','EXCHANGE_MATCH','EXCHANGE_INQUIRY','EXCHANGE_HANDOFF','EXCHANGE_REMINDER','NEED_UPDATE','NEED_CONTRIBUTION','PANTRY_REQUEST','GROUP_MEMBERSHIP','GROUP_REVIEW') AND "kind" NOT LIKE 'ADULT_%' AND "postId" IS NOT NULL AND "commentId" IS NOT NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL)
 OR ("kind" = 'ADULT_REQUEST_CREATED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NOT NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'ADULT_REQUEST_ACCEPTED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NOT NULL AND "conversationId" IS NOT NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'ADULT_MESSAGE_CREATED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NOT NULL AND "messageId" IS NOT NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" IN ('REPORT_RECEIVED','REPORT_RECONSIDERATION') AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NOT NULL AND "decisionId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'CONTENT_DECISION' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NOT NULL AND "decisionId" IS NOT NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'PUSH_TEST' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL AND "recipientId" = "actorId" AND "recipientId" IS NOT NULL)
 OR (kind IN ('AUTHOR_POST','POST_MENTION','POST_REACTION','COMMENT_REACTION','PRAYER_ACK','CHURCH_REVIEW','CHURCH_CONNECTION','CHURCH_ROLE','CHURCH_CAPABILITY','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CHANGED','VOLUNTEER_REQUEST','VOLUNTEER_CONFIRMATION','FEEDBACK_CASE','FEEDBACK_IDEA','PHOTO_TAG_REQUEST','PHOTO_TAG_APPROVED','FRIEND_CONNECTED','EXCHANGE_MATCH','EXCHANGE_INQUIRY','EXCHANGE_HANDOFF','EXCHANGE_REMINDER','NEED_UPDATE','NEED_CONTRIBUTION','PANTRY_REQUEST','GROUP_MEMBERSHIP','GROUP_REVIEW') AND "recipientId" IS NOT NULL AND "sourceId" IS NOT NULL AND "sourceVersion" IS NOT NULL
   AND "notificationCategory" IS NOT NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL
   AND ((kind IN ('AUTHOR_POST','POST_MENTION','POST_REACTION') AND "postId" IS NOT NULL AND "commentId" IS NULL)
     OR (kind='COMMENT_REACTION' AND "postId" IS NOT NULL AND "commentId" IS NOT NULL)
     OR (kind='PRAYER_ACK' AND "postId" IS NOT NULL)
     OR (kind IN ('VOLUNTEER_CHANGED','VOLUNTEER_REQUEST') AND "postId" IS NOT NULL AND "commentId" IS NULL)
     OR (kind IN ('CHURCH_REVIEW','CHURCH_CONNECTION','CHURCH_ROLE','CHURCH_CAPABILITY','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CONFIRMATION','FEEDBACK_CASE','FEEDBACK_IDEA','PHOTO_TAG_REQUEST','PHOTO_TAG_APPROVED','FRIEND_CONNECTED','EXCHANGE_MATCH','EXCHANGE_INQUIRY','EXCHANGE_HANDOFF','EXCHANGE_REMINDER','NEED_UPDATE','NEED_CONTRIBUTION','PANTRY_REQUEST','GROUP_MEMBERSHIP','GROUP_REVIEW') AND "postId" IS NULL AND "commentId" IS NULL)))
 OR ("kind" IN ('CALENDAR_REMINDER','VOLUNTEER_REMINDER') AND "recipientId" IS NOT NULL AND "recipientId" = "actorId"
   AND "sourceId" IS NOT NULL AND "sourceVersion" IS NOT NULL AND "sourceVersion" > 0
   AND "notificationCategory" IS NOT NULL AND "notificationCategory" = 'commitments'
   AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NULL
   AND "messageId" IS NULL AND "reportId" IS NULL AND "decisionId" IS NULL)
);

ALTER TABLE "SocialPreferences" ADD CONSTRAINT "SocialPreferences_volunteer_reminder_choice"
  CHECK (("volunteerReminderMinutes" = 0 AND "volunteerReminderSince" IS NULL)
    OR ("volunteerReminderMinutes" IN (15, 60) AND "volunteerReminderSince" IS NOT NULL));
ALTER TABLE "VolunteerApplication" ADD CONSTRAINT "VolunteerApplication_availability_bounds"
  CHECK (length("availability") <= 500);

-- Compatible older application writes must invalidate a future reminder too.
CREATE FUNCTION volunteer_slot_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."updatedAt" IS NOT DISTINCT FROM OLD."updatedAt" THEN
    NEW."updatedAt" := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER volunteer_slot_touch BEFORE UPDATE ON "PostVolunteerSlot"
FOR EACH ROW EXECUTE FUNCTION volunteer_slot_touch();
