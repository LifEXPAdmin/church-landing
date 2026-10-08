-- Church-owned reusable text, independent of live opportunities and consent.
CREATE TABLE "VolunteerDutyTemplate" (
  "id" TEXT NOT NULL,
  "churchId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "title" TEXT NOT NULL DEFAULT '',
  "duties" TEXT NOT NULL DEFAULT '',
  "requirements" TEXT NOT NULL DEFAULT '',
  "commitment" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "removedAt" TIMESTAMP(3),
  "recoveryRequired" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "VolunteerDutyTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VolunteerDutyTemplate_bounds" CHECK (
    version > 0
    AND length(title) + length(regexp_replace(title COLLATE "C", U&'[^\+010000-\+10FFFF]', '', 'g')) <= 100
    AND length(duties) + length(regexp_replace(duties COLLATE "C", U&'[^\+010000-\+10FFFF]', '', 'g')) <= 2000
    AND length(requirements) + length(regexp_replace(requirements COLLATE "C", U&'[^\+010000-\+10FFFF]', '', 'g')) <= 1000
    AND length(commitment) + length(regexp_replace(commitment COLLATE "C", U&'[^\+010000-\+10FFFF]', '', 'g')) <= 300
  )
);

CREATE INDEX "VolunteerDutyTemplate_churchId_removedAt_recoveryRequired_id_idx"
  ON "VolunteerDutyTemplate"("churchId", "removedAt", "recoveryRequired", "id");
ALTER TABLE "VolunteerDutyTemplate"
  ADD CONSTRAINT "VolunteerDutyTemplate_churchId_fkey"
  FOREIGN KEY ("churchId") REFERENCES "Church"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve every existing protected-control kind and its account scope.
ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_account_scope";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_account_scope" CHECK ((((kind = ANY (ARRAY['ACCOUNT_STATE'::text, 'FEEDBACK_PROMPT'::text, 'REACTION_COUNT_PREFERENCES'::text])) AND ((target)::text = 'ACCOUNT'::text) AND ("sourceId" = "targetId")) OR ((kind = ANY (ARRAY['GROUP_ACCESS'::text, 'TOPIC_ACCESS'::text, 'POST_DISCOVERY'::text, 'EXCHANGE_VISIBILITY'::text, 'EXCHANGE_FAVORITE'::text, 'EXCHANGE_SAVED_SEARCH'::text, 'EXCHANGE_NEED'::text, 'INTERCHURCH_HELP'::text, 'ARTIST'::text, 'ARTIST_RELEASE'::text, 'ARTIST_FOLLOW'::text, 'MEDIA_CATALOG'::text, 'MEDIA_PLAYLIST'::text, 'MEDIA_SAVE'::text, 'PANTRY_HUB'::text, 'EXCHANGE_INQUIRY'::text, 'EXCHANGE_CONTACT'::text, 'EXCHANGE_DEFAULTS'::text, 'DISCOVERY_PREFERENCES'::text, 'CALENDAR_LAYER'::text, 'FOLLOWING_LISTS'::text, 'NOTIFICATION_PREFERENCES'::text, 'AUTHOR_BELL'::text, 'ADMIN_SUPPORT'::text, 'ADMIN_REPORT'::text, 'ADMIN_CLAIM'::text, 'FEEDBACK_CHOICES'::text, 'FEEDBACK_IDEA'::text, 'FEEDBACK_SUBSCRIPTION'::text, 'FEEDBACK_REVIEW'::text, 'PHOTO_TAG'::text, 'PHOTO_TAG_PREFERENCES'::text, 'PROFILE_LOCATION'::text, 'PROFILE_MODULES'::text, 'VOLUNTEER_DUTY_TEMPLATE'::text, 'VOLUNTEER_OPPORTUNITY'::text, 'VOLUNTEER_APPLICATION'::text])) AND ((target)::text = 'ACCOUNT'::text)) OR ((kind <> ALL (ARRAY['ACCOUNT_STATE'::text, 'FEEDBACK_PROMPT'::text, 'REACTION_COUNT_PREFERENCES'::text, 'GROUP_ACCESS'::text, 'TOPIC_ACCESS'::text, 'POST_DISCOVERY'::text, 'EXCHANGE_VISIBILITY'::text, 'EXCHANGE_FAVORITE'::text, 'EXCHANGE_SAVED_SEARCH'::text, 'EXCHANGE_NEED'::text, 'INTERCHURCH_HELP'::text, 'ARTIST'::text, 'ARTIST_RELEASE'::text, 'ARTIST_FOLLOW'::text, 'MEDIA_CATALOG'::text, 'MEDIA_PLAYLIST'::text, 'MEDIA_SAVE'::text, 'PANTRY_HUB'::text, 'EXCHANGE_INQUIRY'::text, 'EXCHANGE_CONTACT'::text, 'EXCHANGE_DEFAULTS'::text, 'DISCOVERY_PREFERENCES'::text, 'CALENDAR_LAYER'::text, 'FOLLOWING_LISTS'::text, 'NOTIFICATION_PREFERENCES'::text, 'AUTHOR_BELL'::text, 'ADMIN_SUPPORT'::text, 'ADMIN_REPORT'::text, 'ADMIN_CLAIM'::text, 'FEEDBACK_CHOICES'::text, 'FEEDBACK_IDEA'::text, 'FEEDBACK_SUBSCRIPTION'::text, 'FEEDBACK_REVIEW'::text, 'PHOTO_TAG'::text, 'PHOTO_TAG_PREFERENCES'::text, 'PROFILE_LOCATION'::text, 'PROFILE_MODULES'::text, 'VOLUNTEER_DUTY_TEMPLATE'::text, 'VOLUNTEER_OPPORTUNITY'::text, 'VOLUNTEER_APPLICATION'::text])) AND ((target)::text <> 'ACCOUNT'::text))));

ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_kind_check";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_kind_check" CHECK ((kind = ANY (ARRAY['REPORT'::text, 'HOLD'::text, 'MODERATION_POST'::text, 'MODERATION_COMMENT'::text, 'MODERATION_GROUP'::text, 'MODERATION_TOPIC'::text, 'MODERATION_EXCHANGE'::text, 'GROUP_ACCESS'::text, 'TOPIC_ACCESS'::text, 'POST_DISCOVERY'::text, 'EXCHANGE_VISIBILITY'::text, 'EXCHANGE_FAVORITE'::text, 'EXCHANGE_SAVED_SEARCH'::text, 'EXCHANGE_NEED'::text, 'INTERCHURCH_HELP'::text, 'ARTIST'::text, 'ARTIST_RELEASE'::text, 'ARTIST_FOLLOW'::text, 'MEDIA_CATALOG'::text, 'MEDIA_PLAYLIST'::text, 'MEDIA_SAVE'::text, 'PANTRY_HUB'::text, 'EXCHANGE_INQUIRY'::text, 'EXCHANGE_CONTACT'::text, 'EXCHANGE_DEFAULTS'::text, 'DISCOVERY_PREFERENCES'::text, 'CALENDAR_LAYER'::text, 'FOLLOWING_LISTS'::text, 'NOTIFICATION_PREFERENCES'::text, 'AUTHOR_BELL'::text, 'ADMIN_SUPPORT'::text, 'ADMIN_REPORT'::text, 'ADMIN_CLAIM'::text, 'APPEAL'::text, 'REACTION_COUNT_PREFERENCES', 'ACCOUNT_STATE'::text, 'AUTHOR_WITHDRAW_POST'::text, 'AUTHOR_WITHDRAW_COMMENT'::text, 'SUPPORT_MESSAGE'::text, 'SUPPORT_ATTACHMENT'::text, 'FEEDBACK_PROMPT'::text, 'FEEDBACK_CHOICES'::text, 'FEEDBACK_IDEA'::text, 'FEEDBACK_SUBSCRIPTION'::text, 'FEEDBACK_REVIEW'::text, 'PHOTO_TAG'::text, 'PHOTO_TAG_PREFERENCES'::text, 'PROFILE_LOCATION'::text, 'PROFILE_MODULES'::text, 'VOLUNTEER_DUTY_TEMPLATE'::text, 'VOLUNTEER_OPPORTUNITY'::text, 'VOLUNTEER_APPLICATION'::text])));
