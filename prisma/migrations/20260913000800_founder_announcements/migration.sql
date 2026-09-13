-- CreateTable
CREATE TABLE "FounderAnnouncement" (
    "id" TEXT NOT NULL,
    "founderId" TEXT NOT NULL,
    "content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "selectedCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "previewedAt" TIMESTAMP(3),
    "queuedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "FounderAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FounderAnnouncementRecipient" (
    "announcementId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SELECTED',
    "messageId" TEXT,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "FounderAnnouncementRecipient_pkey" PRIMARY KEY ("announcementId","recipientId")
);

-- CreateIndex
CREATE INDEX "FounderAnnouncement_founderId_updatedAt_id_idx" ON "FounderAnnouncement"("founderId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "FounderAnnouncement_status_queuedAt_idx" ON "FounderAnnouncement"("status", "queuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FounderAnnouncementRecipient_messageId_key" ON "FounderAnnouncementRecipient"("messageId");

-- CreateIndex
CREATE INDEX "FounderAnnouncementRecipient_recipientId_idx" ON "FounderAnnouncementRecipient"("recipientId");

-- CreateIndex
CREATE INDEX "FounderAnnouncementRecipient_announcementId_status_recipien_idx" ON "FounderAnnouncementRecipient"("announcementId", "status", "recipientId");

-- AddForeignKey
ALTER TABLE "FounderAnnouncement" ADD CONSTRAINT "FounderAnnouncement_founderId_fkey" FOREIGN KEY ("founderId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FounderAnnouncementRecipient" ADD CONSTRAINT "FounderAnnouncementRecipient_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "FounderAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FounderAnnouncementRecipient" ADD CONSTRAINT "FounderAnnouncementRecipient_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FounderAnnouncementRecipient" ADD CONSTRAINT "FounderAnnouncementRecipient_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AdultMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "FounderAnnouncement" ADD CONSTRAINT founder_announcement_shape CHECK (
  version > 0 AND "selectedCount" BETWEEN 0 AND 100 AND "sentCount" >= 0 AND "skippedCount" >= 0 AND
  "sentCount" + "skippedCount" <= "selectedCount" AND
  ((status = 'DRAFT' AND content IS NOT NULL AND char_length(btrim(content)) BETWEEN 1 AND 4000 AND "queuedAt" IS NULL AND "completedAt" IS NULL)
   OR (status = 'SENDING' AND content IS NOT NULL AND char_length(btrim(content)) BETWEEN 1 AND 4000 AND "previewedAt" IS NOT NULL AND "queuedAt" IS NOT NULL AND "completedAt" IS NULL)
   OR (status IN ('COMPLETE','CANCELLED') AND content IS NULL AND "completedAt" IS NOT NULL)));
ALTER TABLE "FounderAnnouncementRecipient" ADD CONSTRAINT founder_recipient_shape CHECK (
  (status IN ('SELECTED','PENDING') AND "messageId" IS NULL AND "finishedAt" IS NULL) OR
  (status = 'SENT' AND "finishedAt" IS NOT NULL) OR
  (status = 'SKIPPED' AND "messageId" IS NULL AND "finishedAt" IS NOT NULL));
CREATE FUNCTION guard_founder_announcement() RETURNS trigger AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW."founderId" <> OLD."founderId" OR NEW."createdAt" <> OLD."createdAt" OR
    (OLD.status <> 'DRAFT' AND NEW."selectedCount" <> OLD."selectedCount") OR
    NEW."sentCount" < OLD."sentCount" OR NEW."skippedCount" < OLD."skippedCount" OR
    (OLD.status IN ('COMPLETE','CANCELLED') AND (NEW.status <> OLD.status OR NEW."completedAt" IS DISTINCT FROM OLD."completedAt")) OR
    (OLD.status = 'SENDING' AND (NEW.status = 'DRAFT' OR NEW."queuedAt" IS DISTINCT FROM OLD."queuedAt" OR
      NEW."previewedAt" IS DISTINCT FROM OLD."previewedAt" OR (NEW.content IS NOT NULL AND NEW.content IS DISTINCT FROM OLD.content))) THEN
    RAISE EXCEPTION 'Announcement identity and committed sends are irreversible';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER guard_founder_announcement BEFORE UPDATE ON "FounderAnnouncement"
FOR EACH ROW EXECUTE FUNCTION guard_founder_announcement();
CREATE FUNCTION guard_announcement_recipient() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW."announcementId" <> OLD."announcementId" OR NEW."recipientId" <> OLD."recipientId" OR
    (OLD.status IN ('SENT','SKIPPED') AND (NEW.status <> OLD.status OR NEW."finishedAt" IS DISTINCT FROM OLD."finishedAt")) OR
    (OLD.status = 'PENDING' AND NEW.status = 'SELECTED') OR
    (OLD.status = 'SENT' AND NEW."messageId" IS NOT NULL AND NEW."messageId" IS DISTINCT FROM OLD."messageId")) THEN
    RAISE EXCEPTION 'Announcement recipient and terminal outcome are irreversible';
  END IF;
  IF NEW."messageId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "AdultMessage" m
    JOIN "FounderAnnouncement" a ON a.id = NEW."announcementId"
    JOIN "AdultConversation" c ON c.id = m."conversationId"
    WHERE m.id = NEW."messageId" AND m.kind = 'FOUNDER_ANNOUNCEMENT' AND m."senderId" = a."founderId" AND
      c."participantAId" = LEAST(a."founderId", NEW."recipientId") AND c."participantBId" = GREATEST(a."founderId", NEW."recipientId")) THEN
    RAISE EXCEPTION 'Announcement receipt must reference its canonical member message';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER guard_announcement_recipient BEFORE INSERT OR UPDATE ON "FounderAnnouncementRecipient"
FOR EACH ROW EXECUTE FUNCTION guard_announcement_recipient();
CREATE FUNCTION cancel_restricted_announcements() RETURNS trigger AS $$
BEGIN
  UPDATE "FounderAnnouncement" SET status = 'CANCELLED', content = NULL,
    "completedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "skippedCount" = "selectedCount" - "sentCount", version = version + 1
    WHERE "founderId" = OLD.id AND status IN ('DRAFT','SENDING');
  UPDATE "FounderAnnouncementRecipient" r SET status = 'SKIPPED', "finishedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    WHERE r.status IN ('SELECTED','PENDING') AND (r."recipientId" = OLD.id OR EXISTS (
      SELECT 1 FROM "FounderAnnouncement" a WHERE a.id = r."announcementId" AND a."founderId" = OLD.id));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER cancel_restricted_announcements BEFORE UPDATE ON "PlatformUser"
FOR EACH ROW WHEN (NEW."suspendedAt" IS NOT NULL OR NEW."deactivatedAt" IS NOT NULL OR
  (OLD."emailVerifiedAt" IS NOT NULL AND NEW."emailVerifiedAt" IS NULL) OR
  (OLD."adultAcknowledgedAt" IS NOT NULL AND (NEW."adultAcknowledgedAt" IS NULL OR OLD."adultPolicyVersion" IS DISTINCT FROM NEW."adultPolicyVersion")))
EXECUTE FUNCTION cancel_restricted_announcements();
