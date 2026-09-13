-- AlterTable
ALTER TABLE "PlatformUser" ADD COLUMN     "pendingFounderWelcomeAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AdultMessage" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'TEXT';

-- CreateTable
CREATE TABLE "FounderWelcome" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "founderId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "replyConsentAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FounderWelcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FounderWelcome_recipientId_key" ON "FounderWelcome"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "FounderWelcome_conversationId_key" ON "FounderWelcome"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "FounderWelcome_messageId_key" ON "FounderWelcome"("messageId");

-- CreateIndex
CREATE INDEX "FounderWelcome_founderId_createdAt_idx" ON "FounderWelcome"("founderId", "createdAt");

-- CreateIndex
CREATE INDEX "AdultMessage_conversationId_senderId_kind_sequence_idx" ON "AdultMessage"("conversationId", "senderId", "kind", "sequence");

-- AddForeignKey
ALTER TABLE "FounderWelcome" ADD CONSTRAINT "FounderWelcome_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FounderWelcome" ADD CONSTRAINT "FounderWelcome_founderId_fkey" FOREIGN KEY ("founderId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FounderWelcome" ADD CONSTRAINT "FounderWelcome_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AdultConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FounderWelcome" ADD CONSTRAINT "FounderWelcome_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AdultMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "AdultMessage" ADD CONSTRAINT adult_message_kind CHECK (kind IN ('TEXT','FOUNDER_WELCOME','FOUNDER_ANNOUNCEMENT'));
ALTER TABLE "FounderWelcome" ADD CONSTRAINT founder_welcome_distinct CHECK ("recipientId" <> "founderId");
CREATE INDEX founder_welcome_pending ON "PlatformUser" ("pendingFounderWelcomeAt", id) WHERE "pendingFounderWelcomeAt" IS NOT NULL;

CREATE FUNCTION guard_founder_welcome() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id <> OLD.id OR NEW."recipientId" <> OLD."recipientId" OR NEW."founderId" <> OLD."founderId" OR
    NEW."conversationId" <> OLD."conversationId" OR NEW."createdAt" <> OLD."createdAt" OR
    (OLD."messageId" IS NULL AND NEW."messageId" IS NOT NULL) OR
    (NEW."messageId" IS NOT NULL AND NEW."messageId" IS DISTINCT FROM OLD."messageId") OR
    (OLD."replyConsentAt" IS NOT NULL AND NEW."replyConsentAt" IS DISTINCT FROM OLD."replyConsentAt") OR
    (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt")) THEN
    RAISE EXCEPTION 'Welcome identity, consent and revocation are irreversible';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "AdultConversation" c WHERE c.id = NEW."conversationId" AND
    c."participantAId" = LEAST(NEW."founderId", NEW."recipientId") AND
    c."participantBId" = GREATEST(NEW."founderId", NEW."recipientId")) OR
    (NEW."messageId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "AdultMessage" m WHERE
     m.id = NEW."messageId" AND m."senderId" = NEW."founderId" AND m."conversationId" = NEW."conversationId" AND m.kind = 'FOUNDER_WELCOME')) THEN
    RAISE EXCEPTION 'Welcome must use its canonical founder/member message';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER guard_founder_welcome BEFORE INSERT OR UPDATE ON "FounderWelcome"
FOR EACH ROW EXECUTE FUNCTION guard_founder_welcome();

CREATE FUNCTION revoke_restricted_welcome() RETURNS trigger AS $$
BEGIN
  NEW."pendingFounderWelcomeAt" := NULL;
  UPDATE "FounderWelcome" SET "revokedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
  WHERE ("recipientId" = OLD.id OR "founderId" = OLD.id) AND "revokedAt" IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER revoke_restricted_welcome BEFORE UPDATE ON "PlatformUser"
FOR EACH ROW WHEN (NEW."suspendedAt" IS NOT NULL OR NEW."deactivatedAt" IS NOT NULL OR
  (OLD."adultAcknowledgedAt" IS NOT NULL AND (NEW."adultAcknowledgedAt" IS NULL OR
   OLD."adultPolicyVersion" IS DISTINCT FROM NEW."adultPolicyVersion")))
EXECUTE FUNCTION revoke_restricted_welcome();

-- Adult policy withdrawal also invalidates device associations immediately.
DROP TRIGGER revoke_account_push ON "PlatformUser";
CREATE TRIGGER revoke_account_push BEFORE UPDATE ON "PlatformUser"
FOR EACH ROW WHEN (NEW."deactivatedAt" IS NOT NULL OR NEW."suspendedAt" IS NOT NULL OR
  NEW."emailVerifiedAt" IS NULL OR NEW."adultAcknowledgedAt" IS NULL OR
  OLD."adultPolicyVersion" IS DISTINCT FROM NEW."adultPolicyVersion" OR
  OLD."credentialVersion" <> NEW."credentialVersion") EXECUTE FUNCTION revoke_account_push();
