-- Add references to the existing private collections, never copied source payloads.
ALTER TABLE "SavedPostItem"
  ADD COLUMN "resourceKind" TEXT,
  ADD COLUMN "resourceId" TEXT;

ALTER TABLE "SavedPostItem" ADD CONSTRAINT "SavedPostItem_resource_reference_check"
CHECK (
  ("resourceKind" IS NULL AND "resourceId" IS NULL)
  OR (
    "postId" IS NULL AND "resourceKind" IS NOT NULL AND "resourceId" IS NOT NULL
    AND "resourceKind" IN ('eventOccurrence', 'exchangeListing', 'mediaCatalogItem', 'volunteerOpportunity')
    AND length("resourceId") BETWEEN 1 AND 128
  )
);

CREATE UNIQUE INDEX "SavedPostItem_ownerId_resourceKind_resourceId_key"
  ON "SavedPostItem"("ownerId", "resourceKind", "resourceId");
