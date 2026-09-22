-- CreateEnum
CREATE TYPE "VolunteerApplicationState" AS ENUM ('SUBMITTED', 'WITHDRAWN', 'DECLINED', 'ACCEPTED');

-- AlterTable
ALTER TABLE "PostVolunteerSlot" ADD COLUMN     "shiftEndAt" TIMESTAMP(3),
ADD COLUMN     "shiftStartAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PostVolunteerSignup" ADD COLUMN     "slotVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "VolunteerOpportunity" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "slotId" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "duties" TEXT NOT NULL DEFAULT '',
    "requirements" TEXT NOT NULL DEFAULT '',
    "contact" TEXT NOT NULL DEFAULT '',
    "commitment" TEXT NOT NULL DEFAULT '',
    "capacity" INTEGER,
    "closedAt" TIMESTAMP(3),
    "recoveryRequired" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolunteerOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolunteerApplication" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT,
    "userId" TEXT,
    "signupId" TEXT,
    "statement" TEXT NOT NULL DEFAULT '',
    "decisionNote" TEXT NOT NULL DEFAULT '',
    "state" "VolunteerApplicationState" NOT NULL DEFAULT 'SUBMITTED',
    "opportunityVersion" INTEGER NOT NULL DEFAULT 1,
    "slotVersion" INTEGER,
    "eventVersion" INTEGER,
    "occurrenceVersion" INTEGER,
    "recoveryRequired" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolunteerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolunteerApplicationEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VolunteerApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerOpportunity_slotId_key" ON "VolunteerOpportunity"("slotId");

-- CreateIndex
CREATE INDEX "VolunteerOpportunity_postId_closedAt_id_idx" ON "VolunteerOpportunity"("postId", "closedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerApplication_signupId_key" ON "VolunteerApplication"("signupId");

-- CreateIndex
CREATE INDEX "VolunteerApplication_userId_id_idx" ON "VolunteerApplication"("userId", "id");

-- CreateIndex
CREATE INDEX "VolunteerApplication_opportunityId_state_id_idx" ON "VolunteerApplication"("opportunityId", "state", "id");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerApplication_opportunityId_userId_key" ON "VolunteerApplication"("opportunityId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerApplicationEvent_applicationId_version_key" ON "VolunteerApplicationEvent"("applicationId", "version");

-- AddForeignKey
ALTER TABLE "VolunteerOpportunity" ADD CONSTRAINT "VolunteerOpportunity_postId_fkey" FOREIGN KEY ("postId") REFERENCES "PlatformPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerOpportunity" ADD CONSTRAINT "VolunteerOpportunity_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "PostVolunteerSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerApplication" ADD CONSTRAINT "VolunteerApplication_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "VolunteerOpportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerApplication" ADD CONSTRAINT "VolunteerApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerApplication" ADD CONSTRAINT "VolunteerApplication_signupId_fkey" FOREIGN KEY ("signupId") REFERENCES "PostVolunteerSignup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerApplicationEvent" ADD CONSTRAINT "VolunteerApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VolunteerApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing signups retain their current effective event schedule and version.
-- No old slot, reservation, event, role or grant is reinterpreted as an application.
UPDATE "PostVolunteerSignup" s SET "slotVersion" = v.version
FROM "PostVolunteerSlot" v WHERE v.id = s."slotId";

ALTER TABLE "PostVolunteerSlot" ADD CONSTRAINT "PostVolunteerSlot_shift_bounds"
CHECK (("shiftStartAt" IS NULL AND "shiftEndAt" IS NULL)
  OR ("shiftStartAt" IS NOT NULL AND "shiftEndAt" IS NOT NULL AND "shiftEndAt" > "shiftStartAt"));
ALTER TABLE "PostVolunteerSignup" ADD CONSTRAINT "PostVolunteerSignup_slot_version"
CHECK ("slotVersion" > 0);
ALTER TABLE "VolunteerOpportunity" ADD CONSTRAINT "VolunteerOpportunity_bounds"
CHECK (version > 0 AND length(title) <= 100 AND length(duties) <= 2000
  AND length(requirements) <= 1000 AND length(contact) <= 300 AND length(commitment) <= 300
  AND ("recoveryRequired" OR ("postId" IS NOT NULL AND length(title) >= 2 AND length(duties) >= 3
    AND (("slotId" IS NULL AND capacity IS NOT NULL AND capacity BETWEEN 1 AND 500 AND length(commitment) >= 3)
      OR ("slotId" IS NOT NULL AND capacity IS NULL)))));
ALTER TABLE "VolunteerApplication" ADD CONSTRAINT "VolunteerApplication_bounds"
CHECK (version > 0 AND "opportunityVersion" > 0 AND ("slotVersion" IS NULL OR "slotVersion" > 0)
  AND ("eventVersion" IS NULL OR "eventVersion" > 0) AND ("occurrenceVersion" IS NULL OR "occurrenceVersion" > 0)
  AND length(statement) <= 1000 AND length("decisionNote") <= 500
  AND ("recoveryRequired" OR ("opportunityId" IS NOT NULL AND "userId" IS NOT NULL)));
ALTER TABLE "VolunteerApplicationEvent" ADD CONSTRAINT "VolunteerApplicationEvent_bounds"
CHECK (version > 0 AND length(note) <= 500
  AND action IN ('SUBMITTED','WITHDRAWN','DECLINED','ACCEPTED','CANCELED'));

-- Protected volunteer controls use the existing account-scoped journal.
ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_kind_check";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_kind_check" CHECK (
 kind IN ('REPORT','HOLD','MODERATION_POST','MODERATION_COMMENT','MODERATION_GROUP','MODERATION_TOPIC','MODERATION_EXCHANGE',
 'GROUP_ACCESS','TOPIC_ACCESS','POST_DISCOVERY','EXCHANGE_VISIBILITY','EXCHANGE_FAVORITE','EXCHANGE_SAVED_SEARCH','EXCHANGE_NEED','PANTRY_HUB','EXCHANGE_INQUIRY','EXCHANGE_CONTACT','EXCHANGE_DEFAULTS','DISCOVERY_PREFERENCES','FOLLOWING_LISTS','NOTIFICATION_PREFERENCES',
 'AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','APPEAL','ACCOUNT_STATE',
 'AUTHOR_WITHDRAW_POST','AUTHOR_WITHDRAW_COMMENT','SUPPORT_MESSAGE','SUPPORT_ATTACHMENT','FEEDBACK_PROMPT',
 'FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION','FEEDBACK_REVIEW','PHOTO_TAG','PHOTO_TAG_PREFERENCES','PROFILE_LOCATION','PROFILE_MODULES','VOLUNTEER_OPPORTUNITY','VOLUNTEER_APPLICATION'));
ALTER TABLE "RetentionControl" DROP CONSTRAINT "RetentionControl_account_scope";
ALTER TABLE "RetentionControl" ADD CONSTRAINT "RetentionControl_account_scope" CHECK (
 (kind IN ('ACCOUNT_STATE','FEEDBACK_PROMPT') AND target::text='ACCOUNT' AND "sourceId"="targetId")
 OR (kind IN ('GROUP_ACCESS','TOPIC_ACCESS','POST_DISCOVERY','EXCHANGE_VISIBILITY','EXCHANGE_FAVORITE','EXCHANGE_SAVED_SEARCH','EXCHANGE_NEED','PANTRY_HUB','EXCHANGE_INQUIRY','EXCHANGE_CONTACT','EXCHANGE_DEFAULTS','DISCOVERY_PREFERENCES','FOLLOWING_LISTS','NOTIFICATION_PREFERENCES','AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION','FEEDBACK_REVIEW','PHOTO_TAG','PHOTO_TAG_PREFERENCES','PROFILE_LOCATION','PROFILE_MODULES','VOLUNTEER_OPPORTUNITY','VOLUNTEER_APPLICATION') AND target::text='ACCOUNT')
 OR (kind NOT IN ('ACCOUNT_STATE','FEEDBACK_PROMPT','GROUP_ACCESS','TOPIC_ACCESS','POST_DISCOVERY','EXCHANGE_VISIBILITY','EXCHANGE_FAVORITE','EXCHANGE_SAVED_SEARCH','EXCHANGE_NEED','PANTRY_HUB','EXCHANGE_INQUIRY','EXCHANGE_CONTACT','EXCHANGE_DEFAULTS','DISCOVERY_PREFERENCES','FOLLOWING_LISTS','NOTIFICATION_PREFERENCES','AUTHOR_BELL','ADMIN_SUPPORT','ADMIN_REPORT','ADMIN_CLAIM','FEEDBACK_CHOICES','FEEDBACK_IDEA','FEEDBACK_SUBSCRIPTION','FEEDBACK_REVIEW','PHOTO_TAG','PHOTO_TAG_PREFERENCES','PROFILE_LOCATION','PROFILE_MODULES','VOLUNTEER_OPPORTUNITY','VOLUNTEER_APPLICATION') AND target::text<>'ACCOUNT'));
