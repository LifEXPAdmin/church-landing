ALTER TABLE "Church"
  ADD COLUMN "serviceTimes" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "accessibilityInfo" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "languages" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "childrenPrograms" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "contactPreferences" TEXT NOT NULL DEFAULT '',
  ADD CONSTRAINT "Church_visitor_information_bounds" CHECK (
    char_length("serviceTimes") <= 1000 AND
    char_length("accessibilityInfo") <= 1000 AND
    char_length("languages") <= 300 AND
    char_length("childrenPrograms") <= 1000 AND
    char_length("contactPreferences") <= 500
  );
