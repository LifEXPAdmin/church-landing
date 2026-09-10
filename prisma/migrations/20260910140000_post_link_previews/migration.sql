-- Preview metadata belongs to the post and shares its current read boundary.
ALTER TABLE "PlatformPost"
  ADD COLUMN "linkUrl" TEXT,
  ADD COLUMN "linkTitle" TEXT,
  ADD COLUMN "linkDescription" TEXT,
  ADD COLUMN "linkSourceUrl" TEXT;
ALTER TABLE "PlatformPost" ADD CONSTRAINT "PlatformPost_link_shape" CHECK (
  ("linkUrl" IS NOT NULL OR ("linkTitle" IS NULL AND "linkDescription" IS NULL AND "linkSourceUrl" IS NULL))
  AND char_length("linkUrl") <= 2048
  AND char_length("linkTitle") <= 200
  AND char_length("linkDescription") <= 400
  AND char_length("linkSourceUrl") <= 2048
);
