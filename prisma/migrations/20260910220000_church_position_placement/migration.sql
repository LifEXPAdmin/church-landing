CREATE TYPE "ChurchPositionPlacement" AS ENUM ('UNCONNECTED', 'ROOT', 'REPORTING');

ALTER TABLE "ChurchPosition" ADD COLUMN "placement" "ChurchPositionPlacement";
-- Existing roots and reporting lines retain their published meaning.
UPDATE "ChurchPosition" SET "placement" =
  CASE WHEN "parentId" IS NULL THEN 'ROOT' ELSE 'REPORTING' END::"ChurchPositionPlacement";
ALTER TABLE "ChurchPosition" ALTER COLUMN "placement" SET NOT NULL;
ALTER TABLE "ChurchPosition" ALTER COLUMN "placement" SET DEFAULT 'UNCONNECTED';
ALTER TABLE "ChurchPosition" ADD CONSTRAINT "ChurchPosition_placement_matches_parent"
  CHECK (("placement" = 'REPORTING') = ("parentId" IS NOT NULL));
