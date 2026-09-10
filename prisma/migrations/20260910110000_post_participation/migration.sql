-- CreateEnum
CREATE TYPE "VolunteerSignupState" AS ENUM ('ACTIVE', 'CANCELED');

-- AlterEnum
ALTER TYPE "ChurchCapability" ADD VALUE 'MANAGE_CHURCH_VOLUNTEERS';

-- AlterTable
ALTER TABLE "PostAudit" ADD COLUMN     "targetId" TEXT;

-- CreateTable
CREATE TABLE "PostPoll" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "closesAt" TIMESTAMPTZ(3) NOT NULL,
    "closesLocal" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PostPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostPollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "PostPollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostPollBallot" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionIds" TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostPollBallot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostVolunteerSlot" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "closedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PostVolunteerSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostVolunteerSignup" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" "VolunteerSignupState" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "eventVersion" INTEGER NOT NULL,
    "occurrenceVersion" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostVolunteerSignup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostPoll_postId_key" ON "PostPoll"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "PostPollOption_pollId_position_key" ON "PostPollOption"("pollId", "position");

-- CreateIndex
CREATE INDEX "PostPollBallot_userId_idx" ON "PostPollBallot"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PostPollBallot_pollId_userId_key" ON "PostPollBallot"("pollId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PostVolunteerSlot_postId_requestKey_key" ON "PostVolunteerSlot"("postId", "requestKey");

-- CreateIndex
CREATE INDEX "PostVolunteerSignup_userId_state_idx" ON "PostVolunteerSignup"("userId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "PostVolunteerSignup_slotId_userId_key" ON "PostVolunteerSignup"("slotId", "userId");

-- AddForeignKey
ALTER TABLE "PostPoll" ADD CONSTRAINT "PostPoll_postId_fkey" FOREIGN KEY ("postId") REFERENCES "PlatformPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPollOption" ADD CONSTRAINT "PostPollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "PostPoll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPollBallot" ADD CONSTRAINT "PostPollBallot_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "PostPoll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPollBallot" ADD CONSTRAINT "PostPollBallot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostVolunteerSlot" ADD CONSTRAINT "PostVolunteerSlot_postId_fkey" FOREIGN KEY ("postId") REFERENCES "PlatformPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostVolunteerSignup" ADD CONSTRAINT "PostVolunteerSignup_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "PostVolunteerSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostVolunteerSignup" ADD CONSTRAINT "PostVolunteerSignup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bound new structures without rewriting existing posts or calendar responses.
ALTER TABLE "PostPoll" ADD CONSTRAINT "PostPoll_version_check" CHECK ("version" > 0);
ALTER TABLE "PostPollOption" ADD CONSTRAINT "PostPollOption_position_check" CHECK ("position" >= 0 AND "position" < 8);
ALTER TABLE "PostPollBallot" ADD CONSTRAINT "PostPollBallot_bounds_check" CHECK ("version" > 0 AND cardinality("optionIds") BETWEEN 1 AND 8);
ALTER TABLE "PostVolunteerSlot" ADD CONSTRAINT "PostVolunteerSlot_bounds_check" CHECK ("version" > 0 AND "capacity" BETWEEN 1 AND 500);
ALTER TABLE "PostVolunteerSignup" ADD CONSTRAINT "PostVolunteerSignup_versions_check" CHECK ("version" > 0 AND "eventVersion" > 0 AND "occurrenceVersion" > 0);
