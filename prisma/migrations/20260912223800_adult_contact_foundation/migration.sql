-- CreateEnum
CREATE TYPE "AdultContactAudience" AS ENUM ('NOBODY', 'FOLLOWED', 'EVERYONE');

-- Only a participant may submit a selected request; review remains explicitly scoped.
ALTER TYPE "CommunityReportTarget" ADD VALUE 'CONTACT_REQUEST';

-- CreateEnum
CREATE TYPE "AdultContactStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'REVOKED');

-- AlterTable
ALTER TABLE "SocialPreferences" ADD COLUMN     "contactRequests" "AdultContactAudience" NOT NULL DEFAULT 'NOBODY';

-- CreateTable
CREATE TABLE "AdultContactRequest" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" "AdultContactStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "conversationId" TEXT,

    CONSTRAINT "AdultContactRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdultConversation" (
    "id" TEXT NOT NULL,
    "participantAId" TEXT NOT NULL,
    "participantBId" TEXT NOT NULL,
    "sendingAllowed" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdultConversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdultContactRequest_senderId_status_expiresAt_idx" ON "AdultContactRequest"("senderId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "AdultContactRequest_recipientId_status_expiresAt_idx" ON "AdultContactRequest"("recipientId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "AdultContactRequest_senderId_createdAt_id_idx" ON "AdultContactRequest"("senderId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AdultContactRequest_recipientId_createdAt_id_idx" ON "AdultContactRequest"("recipientId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AdultContactRequest_conversationId_idx" ON "AdultContactRequest"("conversationId");

-- CreateIndex
CREATE INDEX "AdultConversation_participantBId_idx" ON "AdultConversation"("participantBId");

-- CreateIndex
CREATE UNIQUE INDEX "AdultConversation_participantAId_participantBId_key" ON "AdultConversation"("participantAId", "participantBId");

-- AddForeignKey
ALTER TABLE "AdultContactRequest" ADD CONSTRAINT "AdultContactRequest_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdultContactRequest" ADD CONSTRAINT "AdultContactRequest_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdultContactRequest" ADD CONSTRAINT "AdultContactRequest_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AdultConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdultConversation" ADD CONSTRAINT "AdultConversation_participantAId_fkey" FOREIGN KEY ("participantAId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdultConversation" ADD CONSTRAINT "AdultConversation_participantBId_fkey" FOREIGN KEY ("participantBId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Canonical pair membership and one active request, including crossed requests.
ALTER TABLE "AdultConversation" ADD CONSTRAINT "AdultConversation_distinct_sorted_pair"
CHECK ("participantAId" COLLATE "C" < "participantBId" COLLATE "C");
ALTER TABLE "AdultContactRequest" ADD CONSTRAINT "AdultContactRequest_distinct_participants"
CHECK ("senderId" <> "recipientId");
ALTER TABLE "AdultContactRequest" ADD CONSTRAINT "AdultContactRequest_bounded_purpose"
CHECK (char_length("purpose") BETWEEN 1 AND 1000);
ALTER TABLE "AdultContactRequest" ADD CONSTRAINT "AdultContactRequest_accepted_conversation"
CHECK ((status = 'ACCEPTED') = ("conversationId" IS NOT NULL));
CREATE UNIQUE INDEX "AdultContactRequest_one_pending_pair"
ON "AdultContactRequest" (LEAST("senderId" COLLATE "C", "recipientId" COLLATE "C"), GREATEST("senderId" COLLATE "C", "recipientId" COLLATE "C"))
WHERE status = 'PENDING';
