-- CreateTable
CREATE TABLE "PlatformPostLike" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "PlatformPostLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformPostComment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "PlatformPostComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformPostLike_postId_idx" ON "PlatformPostLike"("postId");

-- CreateIndex
CREATE INDEX "PlatformPostLike_userId_idx" ON "PlatformPostLike"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPostLike_postId_userId_key" ON "PlatformPostLike"("postId", "userId");

-- CreateIndex
CREATE INDEX "PlatformPostComment_postId_createdAt_idx" ON "PlatformPostComment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformPostComment_authorId_idx" ON "PlatformPostComment"("authorId");

-- AddForeignKey
ALTER TABLE "PlatformPostLike" ADD CONSTRAINT "PlatformPostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "PlatformPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformPostLike" ADD CONSTRAINT "PlatformPostLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformPostComment" ADD CONSTRAINT "PlatformPostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "PlatformPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformPostComment" ADD CONSTRAINT "PlatformPostComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
