-- CreateEnum
CREATE TYPE "WaitlistRole" AS ENUM ('BELIEVER', 'CHURCH', 'CREATOR', 'BUSINESS', 'BUILDER');

-- CreateTable
CREATE TABLE "WaitlistSignup" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" "WaitlistRole" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "message" TEXT,

    CONSTRAINT "WaitlistSignup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaitlistSignup_createdAt_idx" ON "WaitlistSignup"("createdAt");

-- CreateIndex
CREATE INDEX "WaitlistSignup_role_idx" ON "WaitlistSignup"("role");

-- CreateIndex
CREATE INDEX "WaitlistSignup_email_idx" ON "WaitlistSignup"("email");
