CREATE TABLE "PostMention" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostMention_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PostMention_postId_recipientId_key" ON "PostMention"("postId", "recipientId");
CREATE INDEX "PostMention_recipientId_idx" ON "PostMention"("recipientId");
ALTER TABLE "PostMention" ADD CONSTRAINT "PostMention_postId_fkey" FOREIGN KEY ("postId") REFERENCES "PlatformPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostMention" ADD CONSTRAINT "PostMention_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
