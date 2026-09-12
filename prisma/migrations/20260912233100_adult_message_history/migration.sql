-- AlterEnum
ALTER TYPE "CommunityReportTarget" ADD VALUE 'MESSAGE';

-- AlterTable
ALTER TABLE "AdultConversation" ADD COLUMN     "lastSequence" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AdultMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdultMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdultConversationState" (
    "conversationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "readThrough" INTEGER NOT NULL DEFAULT 0,
    "hiddenThrough" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AdultConversationState_pkey" PRIMARY KEY ("conversationId","ownerId")
);

-- CreateIndex
CREATE INDEX "AdultMessage_senderId_createdAt_idx" ON "AdultMessage"("senderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdultMessage_conversationId_sequence_key" ON "AdultMessage"("conversationId", "sequence");

-- CreateIndex
CREATE INDEX "AdultConversationState_ownerId_archivedAt_idx" ON "AdultConversationState"("ownerId", "archivedAt");

-- CreateIndex
CREATE INDEX "AdultConversation_participantAId_updatedAt_id_idx" ON "AdultConversation"("participantAId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "AdultConversation_participantBId_updatedAt_id_idx" ON "AdultConversation"("participantBId", "updatedAt", "id");

-- AddForeignKey
ALTER TABLE "AdultMessage" ADD CONSTRAINT "AdultMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AdultConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdultMessage" ADD CONSTRAINT "AdultMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdultConversationState" ADD CONSTRAINT "AdultConversationState_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AdultConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdultConversationState" ADD CONSTRAINT "AdultConversationState_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Canonical messages and personal read markers are bounded independently of membership.
ALTER TABLE "AdultConversation" ADD CONSTRAINT "AdultConversation_sequence_nonnegative" CHECK ("lastSequence" >= 0);
ALTER TABLE "AdultMessage" ADD CONSTRAINT "AdultMessage_sequence_positive" CHECK ("sequence" > 0), ADD CONSTRAINT "AdultMessage_content_bounded" CHECK (char_length(btrim("content")) BETWEEN 1 AND 4000);
ALTER TABLE "AdultConversationState" ADD CONSTRAINT "AdultConversationState_positions_valid" CHECK ("hiddenThrough" >= 0 AND "readThrough" >= "hiddenThrough");
