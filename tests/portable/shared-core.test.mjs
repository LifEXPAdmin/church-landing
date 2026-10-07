import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
assert.ok(process.env.GC_SHARED_CORE_BUILD, "Run scripts/check-shared-core.mjs");
const core = require(join(process.env.GC_SHARED_CORE_BUILD, "index.js"));
const draft = overrides => ({ content: "A valid post", scripture: "", type: "UPDATE", topics: [], audience: "PUBLIC", ...overrides });

test("existing website options resolve to the same source implementation", async () => {
  const web = await import("../../lib/platform/post-options.ts");
  const source = await import("../../packages/shared-core/src/post-options.ts");
  for (const key of Object.keys(web)) assert.equal(web[key], source[key]);
});

test("post categories match the authoritative schema and resource kinds remain bounded", () => {
  assert.deepEqual(core.POST_TYPES, JSON.parse(process.env.GC_SHARED_CORE_SCHEMA_TYPES));
  assert.deepEqual(core.postResourceKinds, ["exchangeListing", "eventOccurrence", "volunteerOpportunity", "mediaCatalogItem"]);
  assert.equal(core.POST_RESOURCE_LIMIT, 3);
});

test("the website copy gate still rejects violations in migrated shared source", () => {
  assert.ok(process.env.GC_SHARED_CORE_TMP);
  const fixture = mkdtempSync(join(process.env.GC_SHARED_CORE_TMP, "shared-copy-negative-"));
  for (const directory of ["app", "components", "lib", "public", "packages/shared-core/src"])
    mkdirSync(join(fixture, directory), { recursive: true });
  writeFileSync(join(fixture, "packages/shared-core/src/example.ts"), 'export const message = "Authored \\u2014 invalid copy";\n');
  const run = spawnSync(process.execPath, [fileURLToPath(new URL("../../scripts/verify-website-copy.mjs", import.meta.url))], { cwd: fixture, encoding: "utf8", timeout: 10000 });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /packages\/shared-core\/src\/example\.ts:1: rewrite authored/);
});

test("editor validation counts normalized newlines without truncating the draft", () => {
  const boundary = draft({ content: "a".repeat(2998) + "\r\nb" });
  assert.equal(core.draftProblem(boundary), null);
  const over = { ...boundary, content: boundary.content + "c" };
  assert.match(core.draftProblem(over), /3,000/);
  assert.equal(over.content.length, 3002);
  assert.match(core.draftProblem(draft({ content: "  x " })), /3 to/);
  assert.equal(core.normalizedPostText("a\rb\r\nc"), "a\nb\nc");
});

test("editor note, excerpt, scripture and topic bounds preserve existing messages", () => {
  assert.equal(core.draftProblem(draft({ contentNote: "n".repeat(120), safeExcerpt: "s".repeat(160), scripture: "r".repeat(120), topics: core.POST_TOPICS.slice(0, 5) })), null);
  assert.match(core.draftProblem(draft({ contentNote: "n".repeat(121) })), /content note/);
  assert.match(core.draftProblem(draft({ safeExcerpt: "s".repeat(161) })), /safe excerpt/);
  assert.match(core.draftProblem(draft({ scripture: "r".repeat(121) })), /Scripture/);
  assert.equal(core.draftProblem(draft({ topics: core.POST_TOPICS.slice(0, 6) })), "Choose up to five topics.");
});

test("locality hints require explicit sharing while leaving server authorization separate", () => {
  const discovery = { language: null, denomination: null, country: "US", placeId: null, shareLocality: false };
  assert.match(core.draftProblem(draft({ discovery })), /Confirm sharing/);
  assert.equal(core.draftProblem(draft({ discovery: { ...discovery, shareLocality: true } })), null);
  assert.equal(core.draftProblem(draft({ discovery: { ...discovery, country: null } })), null);
});

test("previews use the chosen excerpt and conceal noted content without one", () => {
  assert.equal(core.postPreviewText({ content: "Full text", safeExcerpt: "Chosen preview", contentNote: "Note" }), "Chosen preview");
  assert.equal(core.postPreviewText({ content: "Full text", contentNote: "Note" }), "Open this post when you’re ready to read more.");
  assert.equal(core.postPreviewText({ content: "Full text" }), "Full text");
});
