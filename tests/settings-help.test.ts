import test from "node:test";
import assert from "node:assert/strict";
import {
  searchSettingsHelp,
  settingsHelpTopics
} from "../lib/platform/settings-help";
import { safeAccountReturn } from "../lib/platform/account-entry";

test("help search matches all typed words and safely returns empty results", () => {
  assert.ok(
    searchSettingsHelp("  CALENDAR   SHARE  ").some((t) => t.id === "calendar")
  );
  assert.ok(searchSettingsHelp("quiet hours").some((t) => t.id === "alerts"));
  assert.ok(
    searchSettingsHelp("profile theme").some((t) => t.id === "appearance")
  );
  assert.deepEqual(searchSettingsHelp(""), settingsHelpTopics);
  assert.deepEqual(
    searchSettingsHelp("<script>unknown private secret</script>"),
    []
  );
  assert.deepEqual(searchSettingsHelp("calendar password reset"), []);
});

test("every help action has a valid existing account return and unique stable ID", () => {
  assert.equal(
    new Set(settingsHelpTopics.map((topic) => topic.id)).size,
    settingsHelpTopics.length
  );
  for (const topic of settingsHelpTopics) {
    assert.equal(safeAccountReturn(topic.href), topic.href);
    assert.ok(topic.title && topic.body && topic.action);
  }
});
