ALTER TABLE "SocialPreferences"
  ADD COLUMN "menuShortcutIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "menuShortcutsVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SocialPreferences" ADD CONSTRAINT "SocialPreferences_menu_shortcuts_bounds"
  CHECK (cardinality("menuShortcutIds") <= 6
    AND array_position("menuShortcutIds", NULL) IS NULL
    AND octet_length(array_to_string("menuShortcutIds", ',')) <= 480
    AND "menuShortcutsVersion" >= 0);
