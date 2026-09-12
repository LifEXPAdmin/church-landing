-- CreateTable
CREATE TABLE "FriendInvitation" (
    "ownerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "FriendInvitation_pkey" PRIMARY KEY ("ownerId")
);

-- CreateTable
CREATE TABLE "FriendAcceptance" (
    "id" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "signupRecipientId" TEXT,
    "invitationVersion" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FriendAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FriendInvitation_token_key" ON "FriendInvitation"("token");

-- CreateIndex
CREATE UNIQUE INDEX "FriendAcceptance_signupRecipientId_key" ON "FriendAcceptance"("signupRecipientId");

-- CreateIndex
CREATE INDEX "FriendAcceptance_recipientId_state_idx" ON "FriendAcceptance"("recipientId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "FriendAcceptance_inviterId_recipientId_key" ON "FriendAcceptance"("inviterId", "recipientId");

-- AddForeignKey
ALTER TABLE "FriendInvitation" ADD CONSTRAINT "FriendInvitation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendAcceptance" ADD CONSTRAINT "FriendAcceptance_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendAcceptance" ADD CONSTRAINT "FriendAcceptance_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Preserve the consent contract even for administrative database clients.
ALTER TABLE "FriendInvitation" ADD CONSTRAINT "FriendInvitation_valid" CHECK ("version" > 0 AND "token" ~ '^[A-Za-z0-9_-]{43}$');
ALTER TABLE "FriendAcceptance" ADD CONSTRAINT "FriendAcceptance_valid" CHECK (
  "inviterId" <> "recipientId" AND "invitationVersion" > 0
  AND ("signupRecipientId" IS NULL OR "signupRecipientId" = "recipientId")
  AND "state" IN ('PENDING','CONNECTED','REMOVED','UNAVAILABLE')
);
