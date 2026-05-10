-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('BELIEVER', 'CHURCH', 'CREATOR', 'BUSINESS', 'BUILDER');

-- CreateEnum
CREATE TYPE "PlatformPostType" AS ENUM ('TESTIMONY', 'PRAYER', 'TEACHING', 'UPDATE', 'NEED');

-- CreateTable
CREATE TABLE "PlatformUser" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "PlatformRole" NOT NULL DEFAULT 'BELIEVER',
    "bio" TEXT,
    "location" TEXT,
    "website" TEXT,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "PlatformUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformPost" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,
    "type" "PlatformPostType" NOT NULL DEFAULT 'UPDATE',
    "content" TEXT NOT NULL,
    "scripture" TEXT,

    CONSTRAINT "PlatformPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformFollow" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,

    CONSTRAINT "PlatformFollow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformUser_username_key" ON "PlatformUser"("username");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformUser_email_key" ON "PlatformUser"("email");

-- CreateIndex
CREATE INDEX "PlatformUser_role_idx" ON "PlatformUser"("role");

-- CreateIndex
CREATE INDEX "PlatformUser_createdAt_idx" ON "PlatformUser"("createdAt");

-- CreateIndex
CREATE INDEX "PlatformPost_authorId_idx" ON "PlatformPost"("authorId");

-- CreateIndex
CREATE INDEX "PlatformPost_type_idx" ON "PlatformPost"("type");

-- CreateIndex
CREATE INDEX "PlatformPost_createdAt_idx" ON "PlatformPost"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformFollow_followerId_followingId_key" ON "PlatformFollow"("followerId", "followingId");

-- CreateIndex
CREATE INDEX "PlatformFollow_followingId_idx" ON "PlatformFollow"("followingId");

-- AddForeignKey
ALTER TABLE "PlatformPost" ADD CONSTRAINT "PlatformPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformFollow" ADD CONSTRAINT "PlatformFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformFollow" ADD CONSTRAINT "PlatformFollow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
