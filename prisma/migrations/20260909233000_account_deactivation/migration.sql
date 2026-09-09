-- Existing accounts remain active. This is distinct from operator suspension.
ALTER TABLE "PlatformUser" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
