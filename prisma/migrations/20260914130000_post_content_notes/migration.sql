ALTER TABLE "PlatformPost"
  ADD COLUMN "contentNote" TEXT,
  ADD COLUMN "safeExcerpt" TEXT,
  ADD CONSTRAINT "PlatformPost_content_note_length"
    CHECK ("contentNote" IS NULL OR char_length("contentNote") <= 120),
  ADD CONSTRAINT "PlatformPost_safe_excerpt_length"
    CHECK ("safeExcerpt" IS NULL OR char_length("safeExcerpt") <= 160);
