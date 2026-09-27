-- Ordered references only. Current source services own access and card details.
ALTER TABLE "PlatformPost" ADD COLUMN "resourceReferences" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "PlatformPost" ADD CONSTRAINT "PlatformPost_resourceReferences_array"
  CHECK (jsonb_typeof("resourceReferences") = 'array' AND jsonb_array_length("resourceReferences") <= 3);
