-- CreateEnum
CREATE TYPE "CalendarVisibility" AS ENUM ('PRIVATE', 'CHURCH', 'PUBLIC');

-- CreateEnum
CREATE TYPE "CalendarShareLevel" AS ENUM ('BUSY', 'DETAILS');

-- CreateEnum
CREATE TYPE "CalendarResponseState" AS ENUM ('GOING', 'MAYBE', 'DECLINED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChurchCapability" ADD VALUE 'EDIT_CHURCH_CALENDAR';
ALTER TYPE "ChurchCapability" ADD VALUE 'PUBLISH_CHURCH_EVENTS';

-- CreateTable
CREATE TABLE "PlatformCalendar" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "churchId" TEXT,
    "creatorId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "onlineUrl" TEXT NOT NULL DEFAULT '',
    "organizer" TEXT NOT NULL DEFAULT '',
    "visibility" "CalendarVisibility" NOT NULL DEFAULT 'PRIVATE',
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "timeZone" TEXT NOT NULL,
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "weeklyUntil" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarOccurrence" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "onlineUrl" TEXT NOT NULL DEFAULT '',
    "organizer" TEXT NOT NULL DEFAULT '',
    "allDay" BOOLEAN NOT NULL,
    "timeZone" TEXT NOT NULL,
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "isException" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CalendarOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarShare" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "level" "CalendarShareLevel" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEventShare" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "level" "CalendarShareLevel" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEventShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarResponse" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" "CalendarResponseState" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarAudit" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformCalendar_ownerId_archivedAt_idx" ON "PlatformCalendar"("ownerId", "archivedAt");

-- CreateIndex
CREATE INDEX "PlatformCalendar_churchId_archivedAt_idx" ON "PlatformCalendar"("churchId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformCalendar_creatorId_requestKey_key" ON "PlatformCalendar"("creatorId", "requestKey");

-- CreateIndex
CREATE INDEX "CalendarEvent_calendarId_canceledAt_idx" ON "CalendarEvent"("calendarId", "canceledAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_calendarId_requestKey_key" ON "CalendarEvent"("calendarId", "requestKey");

-- CreateIndex
CREATE INDEX "CalendarOccurrence_startAt_endAt_idx" ON "CalendarOccurrence"("startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarOccurrence_eventId_ordinal_key" ON "CalendarOccurrence"("eventId", "ordinal");

-- CreateIndex
CREATE INDEX "CalendarShare_connectionId_revokedAt_idx" ON "CalendarShare"("connectionId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarShare_calendarId_churchId_key" ON "CalendarShare"("calendarId", "churchId");

-- CreateIndex
CREATE INDEX "CalendarEventShare_connectionId_revokedAt_idx" ON "CalendarEventShare"("connectionId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventShare_eventId_churchId_key" ON "CalendarEventShare"("eventId", "churchId");

-- CreateIndex
CREATE INDEX "CalendarResponse_userId_state_idx" ON "CalendarResponse"("userId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarResponse_occurrenceId_userId_key" ON "CalendarResponse"("occurrenceId", "userId");

-- CreateIndex
CREATE INDEX "CalendarAudit_calendarId_createdAt_idx" ON "CalendarAudit"("calendarId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlatformCalendar" ADD CONSTRAINT "PlatformCalendar_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformCalendar" ADD CONSTRAINT "PlatformCalendar_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformCalendar" ADD CONSTRAINT "PlatformCalendar_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "PlatformCalendar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarOccurrence" ADD CONSTRAINT "CalendarOccurrence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarShare" ADD CONSTRAINT "CalendarShare_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "PlatformCalendar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarShare" ADD CONSTRAINT "CalendarShare_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarShare" ADD CONSTRAINT "CalendarShare_connectionId_churchId_fkey" FOREIGN KEY ("connectionId", "churchId") REFERENCES "ChurchConnection"("id", "churchId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CalendarEventShare" ADD CONSTRAINT "CalendarEventShare_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventShare" ADD CONSTRAINT "CalendarEventShare_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventShare" ADD CONSTRAINT "CalendarEventShare_connectionId_churchId_fkey" FOREIGN KEY ("connectionId", "churchId") REFERENCES "ChurchConnection"("id", "churchId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CalendarResponse" ADD CONSTRAINT "CalendarResponse_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "CalendarOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarResponse" ADD CONSTRAINT "CalendarResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarAudit" ADD CONSTRAINT "CalendarAudit_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "PlatformCalendar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Ownership and record bounds remain enforced independently of application forms.
ALTER TABLE "PlatformCalendar" ADD CONSTRAINT "PlatformCalendar_one_owner" CHECK (("ownerId" IS NOT NULL) <> ("churchId" IS NOT NULL));
ALTER TABLE "PlatformCalendar" ADD CONSTRAINT "PlatformCalendar_bounds" CHECK ("version" >= 1 AND char_length("name") >= 1 AND char_length("name") <= 100 AND char_length("timeZone") >= 1 AND char_length("timeZone") <= 100);
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_bounds" CHECK ("version" >= 1 AND char_length("title") >= 1 AND char_length("title") <= 160 AND char_length("description") <= 5000 AND char_length("location") <= 300 AND char_length("onlineUrl") <= 2000 AND char_length("organizer") <= 100);
ALTER TABLE "CalendarOccurrence" ADD CONSTRAINT "CalendarOccurrence_bounds" CHECK ("version" >= 1 AND "ordinal" >= 0 AND "ordinal" < 52 AND "endAt" > "startAt" AND char_length("title") >= 1 AND char_length("title") <= 160 AND char_length("description") <= 5000 AND char_length("location") <= 300 AND char_length("onlineUrl") <= 2000 AND char_length("organizer") <= 100);
ALTER TABLE "CalendarShare" ADD CONSTRAINT "CalendarShare_version" CHECK ("version" >= 1);
ALTER TABLE "CalendarEventShare" ADD CONSTRAINT "CalendarEventShare_version" CHECK ("version" >= 1);
ALTER TABLE "CalendarResponse" ADD CONSTRAINT "CalendarResponse_version" CHECK ("version" >= 1);
