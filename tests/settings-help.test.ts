import test from "node:test";
import assert from "node:assert/strict";
import {
  searchSettingsHelp,
  settingsHelpTopics
} from "../lib/platform/settings-help";
import {
  accountEntryHref,
  safeAccountReturn
} from "../lib/platform/account-entry";

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

test("pantry account entry preserves bounded destinations without private input or action replay", () => {
  for (const path of [
    "/platform/pantry",
    "/platform/pantry/mine",
    "/platform/pantry/hub-123",
    "/platform/pantry/hub-123/manage",
    "/platform/pantry/hub-123/queue",
    "/platform/pantry/hub-123/sessions",
    "/platform/pantry/hub-123/audit",
    "/platform/pantry/requests/request_123"
  ]) {
    const attempted = path + "/?cursor=private&contact=private&operation=confirm#private";
    assert.equal(safeAccountReturn(attempted), path);
    const login = new URL(accountEntryHref("login", attempted), "https://test.invalid");
    assert.equal(login.searchParams.get("next"), path);
  }
  for (const path of [
    "https://example.com/platform/pantry/mine",
    "//example.com/platform/pantry/mine",
    "/platform/pantry/hub-123/delete",
    "/platform/pantry/requests/request_123/edit",
    "/platform/pantry/" + "x".repeat(101),
    "/platform/pantry/%2Fexternal",
    "/platform/pantry/hub\\private"
  ]) assert.equal(safeAccountReturn(path), "/platform");
});
