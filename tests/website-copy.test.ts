import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const script = resolve("scripts/verify-website-copy.mjs");
function check(source: string, file = "app/page.tsx") {
  const root = mkdtempSync(join(tmpdir(), "gc-website-copy-"));
  try {
    for (const dir of ["app", "components", "lib", "public"])
      mkdirSync(join(root, dir));
    writeFileSync(join(root, file), source);
    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(
      readFileSync(join(root, file), "utf8"),
      source,
      "The check must never rewrite content"
    );
    return result;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("copy guard rejects visible literals, escaped strings, entities, generated characters and placeholders", () => {
  for (const source of [
    'export const label = "Next — continue";',
    'export const label = "2–8 choices";',
    String.raw`export const label = "Next \u2014 continue";`,
    "export default () => <p>Next &mdash; continue</p>;",
    'export default () => <p aria-label="2&#x2013;8 choices" />;',
    "export default () => <p>Next &#8212; continue</p>;",
    "export const label = `Time ${start}–${end}`;",
    "export const label = String.fromCharCode(0x2014);",
    "export const label = String.fromCodePoint(8211);",
    'export const label = "—";',
    'export const label = "Next -- continue";',
    'export const label = "Next--continue";'
  ]) {
    const result = check(source);
    assert.equal(result.status, 1, source + result.stdout + result.stderr);
    assert.match(result.stderr, /app\/page.tsx:\d+:/);
  }
});

test("copy guard preserves technical syntax, comments, ordinary hyphens and dynamic member text", () => {
  const result = check(`
    // This engineering comment uses — and is not rendered.
    export const font = "--font-heading";
    export const css = "text-[length:var(--gc-reader-size)]";
    export const url = "https://example.test/a--b";
    export default ({ post }) => <p className={css} title="Account-specific choices">{post.body}</p>;
  `);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Stored member content is untouched/);
});

test("copy guard includes static accessibility/metadata and CSS-generated text", () => {
  for (const [source, file] of [
    ["<svg><title>Faith &ndash; community</title></svg>", "public/card.svg"],
    ['{"description":"Faith — community"}', "public/site.webmanifest"],
    [String.raw`.empty::after { content: "\2014"; }`, "app/site.css"],
    ["<svg><title>Faith -- community</title></svg>", "public/card.svg"],
    ['{"description":"Faith -- community"}', "public/site.webmanifest"],
    ['.empty::after { content: "--"; }', "app/site.css"]
  ]) {
    const result = check(source, file);
    assert.equal(result.status, 1, result.stdout + result.stderr);
  }
});
