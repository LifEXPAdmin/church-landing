import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseReadingPreferences,
  defaultReadingPreferences
} from "../lib/platform/reading-preferences";

test("appearance cookie has safe defaults and rejects malformed/unrecognized values", () => {
  for (const value of [
    undefined,
    "",
    "%",
    "null",
    "[]",
    "true",
    "123",
    "%7Bbroken",
    JSON.stringify({
      appearance: "evil",
      mode: "auto",
      size: "4px",
      reduceMotion: "false",
      email: "not-a-setting"
    })
  ]) {
    assert.deepEqual(parseReadingPreferences(value), defaultReadingPreferences);
  }
  const bad = parseReadingPreferences();
  bad.appearance = "dark";
  assert.equal(defaultReadingPreferences.appearance, "system");
});
test("validated display settings roundtrip without retaining arbitrary identifiers", () => {
  const settings = {
    appearance: "dark",
    mode: "pages",
    size: "largest",
    reduceMotion: true
  };
  assert.deepEqual(
    parseReadingPreferences(
      encodeURIComponent(
        JSON.stringify({
          ...settings,
          email: "fictional@example.test",
          token: "do-not-retain"
        })
      )
    ),
    settings
  );
});
test("opaque light/dark body, muted, action, accent and focus token pairs meet their contrast targets", () => {
  const css = readFileSync("app/platform/platform.css", "utf8");
  const luminance = (hex: string) => {
    const channels = hex
      .match(/[a-f\d]{2}/gi)!
      .map((c) => parseInt(c, 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  for (const selector of [
    ".platform-design {",
    '.platform-design[data-appearance="dark"] {'
  ]) {
    const block = css
      .slice(css.indexOf(selector) + selector.length)
      .split("}")[0];
    const tokens = Object.fromEntries(
      [...block.matchAll(/--gc-([a-z-]+):\s*(#[a-f\d]{6})/gi)].map((m) => [
        m[1],
        m[2]
      ])
    );
    for (const [fore, back, min] of [
      ["text", "canvas", 4.5],
      ["muted", "canvas", 4.5],
      ["text", "surface", 4.5],
      ["muted", "surface", 4.5],
      ["on-action", "action", 4.5],
      ["accent", "surface", 4.5],
      ["border", "surface", 3],
      ["focus", "surface", 3],
      ["error", "surface", 4.5]
    ] as const) {
      const a = luminance(tokens[fore]),
        b = luminance(tokens[back]);
      assert.ok(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= min,
        `${selector} ${fore}/${back}`
      );
    }
  }
});
