ALTER TYPE "ChurchCapability" ADD VALUE 'PUBLISH_CHURCH_POSTS';
ALTER TYPE "ChurchCapability" ADD VALUE 'MODERATE_CHURCH_POSTS';
CREATE TYPE "PostAudience" AS ENUM ('PUBLIC', 'CHURCH');
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'WITHDRAWN');
CREATE TYPE "PostReplyAudience" AS ENUM ('VIEWERS', 'CHURCH_MEMBERS');
ALTER TABLE "PlatformPost"
 ADD COLUMN "authorChurchId" TEXT,
 ADD COLUMN "audienceChurchId" TEXT,
 ADD COLUMN "audience" "PostAudience" NOT NULL DEFAULT 'PUBLIC',
 ADD COLUMN "status" "PostStatus" NOT NULL DEFAULT 'PUBLISHED',
 ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN "requestKey" TEXT,
 ADD COLUMN "topics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 ADD COLUMN "editedAt" TIMESTAMP(3),
 ADD COLUMN "publishedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "withdrawnAt" TIMESTAMP(3),
 ADD COLUMN "discussionClosed" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "replyAudience" "PostReplyAudience" NOT NULL DEFAULT 'VIEWERS',
 ADD COLUMN "allowReposts" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "pinUntil" TIMESTAMP(3),
 ADD COLUMN "scheduleAt" TIMESTAMP(3),
 ADD COLUMN "scheduledById" TEXT,
 ADD COLUMN "scheduleLocal" TEXT,
 ADD COLUMN "scheduleZone" TEXT,
 ADD COLUMN "eventOccurrenceId" TEXT;
UPDATE "PlatformPost" SET "publishedAt" = "createdAt";
ALTER TABLE "PlatformPost"
 ADD CONSTRAINT "PlatformPost_authorChurchId_fkey" FOREIGN KEY ("authorChurchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD CONSTRAINT "PlatformPost_audienceChurchId_fkey" FOREIGN KEY ("audienceChurchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD CONSTRAINT "PlatformPost_eventOccurrenceId_fkey" FOREIGN KEY ("eventOccurrenceId") REFERENCES "CalendarOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD CONSTRAINT "PlatformPost_audience_check" CHECK ("audience" <> 'CHURCH' OR "audienceChurchId" IS NOT NULL),
 ADD CONSTRAINT "PlatformPost_church_author_check" CHECK ("authorChurchId" IS NULL OR ("audienceChurchId" IS NOT NULL AND "audienceChurchId" = "authorChurchId")),
 ADD CONSTRAINT "PlatformPost_reply_check" CHECK ("replyAudience" <> 'CHURCH_MEMBERS' OR "audienceChurchId" IS NOT NULL),
 ADD CONSTRAINT "PlatformPost_pin_check" CHECK ("pinUntil" IS NULL OR ("authorChurchId" IS NOT NULL AND "status" = 'PUBLISHED')),
 ADD CONSTRAINT "PlatformPost_schedule_check" CHECK ("status" <> 'SCHEDULED' OR ("authorChurchId" IS NOT NULL AND "scheduleAt" IS NOT NULL AND "scheduledById" IS NOT NULL AND "scheduleLocal" IS NOT NULL AND "scheduleZone" IS NOT NULL)),
 ADD CONSTRAINT "PlatformPost_version_check" CHECK ("version" > 0),
 ADD CONSTRAINT "PlatformPost_topics_check" CHECK (cardinality("topics") <= 5);
CREATE UNIQUE INDEX "PlatformPost_authorId_requestKey_key" ON "PlatformPost"("authorId", "requestKey");
CREATE UNIQUE INDEX "PlatformPost_eventOccurrenceId_key" ON "PlatformPost"("eventOccurrenceId");
CREATE INDEX "PlatformPost_audienceChurchId_status_publishedAt_idx" ON "PlatformPost"("audienceChurchId", "status", "publishedAt");
CREATE INDEX "PlatformPost_status_scheduleAt_idx" ON "PlatformPost"("status", "scheduleAt");
CREATE TABLE "PostAudit" (
 "id" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "postId" TEXT NOT NULL,
 "actorId" TEXT NOT NULL,
 "action" TEXT NOT NULL,
 "version" INTEGER NOT NULL,
 CONSTRAINT "PostAudit_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "PostAudit_postId_fkey" FOREIGN KEY ("postId") REFERENCES "PlatformPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "PostAudit_version_check" CHECK ("version" > 0)
);
CREATE INDEX "PostAudit_postId_createdAt_idx" ON "PostAudit"("postId", "createdAt");
