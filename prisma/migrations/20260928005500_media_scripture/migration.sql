-- Existing media has no classified Scripture tags. Source text is never inferred.
ALTER TABLE "MediaCatalogItem" ADD COLUMN "scriptureRanges" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "MediaCatalogItem" ADD CONSTRAINT "MediaCatalogItem_scriptureRanges_array"
  CHECK (jsonb_typeof("scriptureRanges") = 'array' AND jsonb_array_length("scriptureRanges") <= 20);
