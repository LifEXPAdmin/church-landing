-- AlterTable
ALTER TABLE "SocialEvent" ADD COLUMN     "conversationId" TEXT,
ADD COLUMN     "messageId" TEXT,
ADD COLUMN     "requestId" TEXT,
ALTER COLUMN "postId" DROP NOT NULL,
ALTER COLUMN "commentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SocialPreferences" ADD COLUMN     "messageAlerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requestAlerts" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "SocialEvent_recipientId_kind_conversationId_idx" ON "SocialEvent"("recipientId", "kind", "conversationId");


-- Upgrade existing canonical private sources without copying their bodies.
INSERT INTO "SocialEvent" ("id", "key", "kind", "actorId", "recipientId", "requestId", "createdAt")
SELECT 'event_request_' || "id", 'adult-request:' || "id", 'ADULT_REQUEST_CREATED', "senderId", "recipientId", "id", "createdAt" FROM "AdultContactRequest" ON CONFLICT ("key") DO NOTHING;
INSERT INTO "SocialEvent" ("id", "key", "kind", "actorId", "recipientId", "requestId", "conversationId", "createdAt")
SELECT 'event_accepted_' || "id", 'adult-request-accepted:' || "id", 'ADULT_REQUEST_ACCEPTED', "recipientId", "senderId", "id", "conversationId", "updatedAt" FROM "AdultContactRequest" WHERE "status" = 'ACCEPTED' ON CONFLICT ("key") DO NOTHING;
INSERT INTO "SocialEvent" ("id", "key", "kind", "actorId", "recipientId", "conversationId", "messageId", "createdAt")
SELECT 'event_message_' || m."id", 'adult-message:' || m."id", 'ADULT_MESSAGE_CREATED', m."senderId", CASE WHEN c."participantAId" = m."senderId" THEN c."participantBId" ELSE c."participantAId" END, c."id", m."id", m."createdAt" FROM "AdultMessage" m JOIN "AdultConversation" c ON c."id" = m."conversationId" ON CONFLICT ("key") DO NOTHING;
CREATE UNIQUE INDEX "SocialEvent_one_message_intent" ON "SocialEvent" ("messageId") WHERE "messageId" IS NOT NULL;
CREATE UNIQUE INDEX "SocialEvent_one_request_transition" ON "SocialEvent" ("kind", "requestId") WHERE "requestId" IS NOT NULL;
ALTER TABLE "SocialEvent" ADD CONSTRAINT "SocialEvent_source_shape" CHECK (
 ("kind" NOT LIKE 'ADULT_%' AND "postId" IS NOT NULL AND "commentId" IS NOT NULL AND "requestId" IS NULL AND "conversationId" IS NULL AND "messageId" IS NULL)
 OR ("kind" = 'ADULT_REQUEST_CREATED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NOT NULL AND "conversationId" IS NULL AND "messageId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'ADULT_REQUEST_ACCEPTED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NOT NULL AND "conversationId" IS NOT NULL AND "messageId" IS NULL AND "recipientId" IS NOT NULL)
 OR ("kind" = 'ADULT_MESSAGE_CREATED' AND "postId" IS NULL AND "commentId" IS NULL AND "requestId" IS NULL AND "conversationId" IS NOT NULL AND "messageId" IS NOT NULL AND "recipientId" IS NOT NULL));
