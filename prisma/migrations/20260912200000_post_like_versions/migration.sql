-- Retain Unlike state so stale clients cannot overwrite a newer choice.
-- Existing rows retain their identity and represent active Likes at version 1.
ALTER TABLE "PlatformPostLike"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
