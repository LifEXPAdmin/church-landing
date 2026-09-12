import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  sameSettingScope,
  unavailableSetting,
  displayResetFields,
  type SettingValueState
} from "../lib/platform/settings-contract";
import {
  settingsRegistry,
  settingsFolders,
  searchSettings,
  settingHref
} from "../lib/platform/settings-registry";
import {
  parseReadingPreferences,
  defaultReadingPreferences
} from "../lib/platform/reading-preferences";

test("settings keep browser, account and selected church scopes separate", () => {
  assert.equal(
    sameSettingScope(
      { kind: "personal", userId: "a" },
      { kind: "personal", userId: "a" }
    ),
    true
  );
  assert.equal(
    sameSettingScope(
      { kind: "personal", userId: "a" },
      { kind: "personal", userId: "b" }
    ),
    false
  );
  assert.equal(
    sameSettingScope(
      { kind: "church", churchId: "a" },
      { kind: "church", churchId: "b" }
    ),
    false
  );
  assert.equal(
    sameSettingScope(
      { kind: "church", churchId: "a" },
      { kind: "personal", userId: "a" }
    ),
    false
  );
  assert.equal(
    sameSettingScope({ kind: "browser" }, { kind: "church", churchId: "a" }),
    false
  );
});

test("denied, unavailable and temporary errors contain no private values", () => {
  for (const status of ["forbidden", "unavailable", "error"] as const) {
    const state = unavailableSetting(status, "Review current access.");
    assert.deepEqual(Object.keys(state).sort(), [
      "editable",
      "reason",
      "status"
    ]);
    assert.equal(state.editable, false);
    assert.equal(state.status, status);
  }
  const locked: SettingValueState = {
    status: "locked",
    requested: "ONLY_ME",
    effective: "ONLY_ME",
    source: "account",
    editable: false,
    reason: "Current policy",
    version: 3
  };
  assert.equal(locked.effective, "ONLY_ME");
  // @ts-expect-error A denied result cannot carry a hidden private value.
  const denied: SettingValueState = {
    status: "forbidden",
    editable: false,
    reason: "No access",
    effective: "private-contact"
  };
  void denied;
});

test("search finds approved synonyms and folder paths without future capabilities or values", () => {
  assert.ok(
    searchSettings("alerts").some((s) => s.id === "notifications.availability")
  );
  assert.ok(
    searchSettings("hide phone").some((s) => s.id === "privacy.directory")
  );
  assert.ok(
    searchSettings("larger text").some((s) => s.id === "display.reading")
  );
  assert.ok(searchSettings("Sécurité").length === 0);
  assert.ok(searchSettings("  EMÁIL  ").some((s) => s.id === "account.email"));
  for (const q of [
    "family",
    "payments",
    "direct messages",
    "person@private.example",
    " ",
    "x".repeat(201)
  ])
    assert.deepEqual(searchSettings(q), []);
});

test("registration preserves existing choices and limits reset to browser presentation", () => {
  const choices = {
    appearance: "dark",
    mode: "list",
    size: "largest",
    reduceMotion: true,
    reduceData: true
  };
  const saved = encodeURIComponent(JSON.stringify(choices));
  assert.deepEqual(parseReadingPreferences(saved), choices);
  const reading = settingsRegistry.find((s) => s.id === "display.reading")!;
  assert.deepEqual(reading.defaultValue, defaultReadingPreferences);
  assert.equal(reading.scope, "browser");
  assert.deepEqual([...displayResetFields].sort(), Object.keys(choices).sort());
  for (const field of [
    "mentions",
    "showRelationships",
    "emailAudience",
    "phoneAudience",
    "listed",
    "password",
    "churchId"
  ])
    assert.equal(
      (displayResetFields as readonly string[]).includes(field),
      false
    );
  assert.deepEqual(parseReadingPreferences(saved), choices);
});

test("initial registry has stable unique IDs, service owners and real linked destinations", () => {
  assert.equal(
    new Set(settingsRegistry.map((s) => s.id)).size,
    settingsRegistry.length
  );
  const controls = new Set<string>();
  for (const s of settingsRegistry) {
    assert.match(s.id, /^[a-z]+\.[a-z]+$/);
    assert.ok(settingsFolders.some((f) => f.id === s.folder));
    assert.ok(s.persistenceOwner && s.read);
    if (s.state === "future") continue;
    if ("href" in s.destination) {
      const path = new URL(s.destination.href, "https://fixture.invalid")
        .pathname;
      assert.ok(existsSync("app" + path + "/page.tsx"), path);
    } else {
      assert.equal(controls.has(s.destination.control), false);
      controls.add(s.destination.control);
      assert.match(settingHref(s), /^\/platform\/settings\/[a-z]+\/[a-z]+$/);
    }
  }
  assert.equal(
    settingsRegistry.find((s) => s.id === "church.organization")!.scope,
    "church"
  );
});
