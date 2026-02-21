-- CreateEnum
CREATE TYPE "AnalyticsEventType" AS ENUM ('PAGE_VIEW', 'CTA_CLICK', 'JOIN_SUBMIT', 'JOIN_SUCCESS');

-- AlterTable
ALTER TABLE "WaitlistSignup" ADD COLUMN "source" TEXT;

-- CreateTable
CREATE TABLE "WaitlistEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" "AnalyticsEventType" NOT NULL,
    "path" TEXT NOT NULL,
    "role" "WaitlistRole",
    "label" TEXT,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "referrer" TEXT,

    CONSTRAINT "WaitlistEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaitlistEvent_createdAt_idx" ON "WaitlistEvent"("createdAt");

-- CreateIndex
CREATE INDEX "WaitlistEvent_eventType_idx" ON "WaitlistEvent"("eventType");

-- CreateIndex
CREATE INDEX "WaitlistEvent_path_idx" ON "WaitlistEvent"("path");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistSignup_email_role_key" ON "WaitlistSignup"("email", "role");
