import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkPortability } from "../scripts/check-portability.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = process.env.GC_SHARED_CORE_TMP;
assert.ok(scratch && isAbsolute(scratch), "Set GC_SHARED_CORE_TMP to existing task-owned generated storage");
const scratchRoot = realpathSync(scratch);
const wireFile = "lib/platform/api-contracts.ts";
const sourceFile = "packages/shared-core/src/boundary-probe.ts";

// Each mutation runs in its own small generated copy. Never mutate a checkout,
// fixtures from another worker, or the frozen baseline to make a change pass.
function fixture(t) {
  const directory = mkdtempSync(join(scratchRoot, "portability-check-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const file of ["packages/shared-core", wireFile, "tests/fixtures"]) {
    mkdirSync(dirname(join(directory, file)), { recursive: true });
    cpSync(join(root, file), join(directory, file), { recursive: true });
  }
  return directory;
}
function edit(directory, file, before, after) {
  const path = join(directory, file), source = readFileSync(path, "utf8");
  assert.ok(source.includes(before), "Mutation must alter a known source expression");
  writeFileSync(path, source.replace(before, after));
}
function editJson(directory, file, mutate) {
  const path = join(directory, file), value = JSON.parse(readFileSync(path, "utf8"));
  mutate(value);
  writeFileSync(path, JSON.stringify(value));
}
async function rejected(directory, code) {
  const result = await checkPortability(directory);
  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.match(result.findings[0].code, code);
  return result;
}

test("reviewed package and all frozen v1 requests pass", async () => {
  const result = await checkPortability(root);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.checks.includes("v1-request-values-and-endpoints"));
});

test("pure local transitive modules and additive response fields remain compatible", async t => {
  const directory = fixture(t);
  writeFileSync(join(directory, sourceFile), 'export { value } from "./pure-child";\n');
  writeFileSync(join(directory, "packages/shared-core/src/pure-child.ts"), "export const value: number = 3;\n");
  edit(directory, wireFile, "const postBase = {", "const postBase = {\n  futureOptionalForConsumers: nullable(text(30)),");
  const result = await checkPortability(directory);
  assert.equal(result.ok, true, JSON.stringify(result));
});

for (const [name, code] of [
  ["Next runtime", 'import "next/headers";'],
  ["Prisma runtime", 'import "@prisma/client";'],
  ["Node runtime", 'import "node:fs";'],
  ["browser-only dependency", 'export * from "react-dom";'],
  ["type-only server dependency", 'export type Probe = import("next").NextConfig;']
]) test(`rejects ${name} through a local transitive dependency`, async t => {
  const directory = fixture(t);
  writeFileSync(join(directory, sourceFile), 'import "./runtime-child";\n');
  writeFileSync(join(directory, "packages/shared-core/src/runtime-child.ts"), code);
  await rejected(directory, /^EXTERNAL_PORTABLE_IMPORT$/);
});

for (const [name, code, finding] of [
  ["DOM globals", "export const value = document.title;", /^PORTABLE_TYPES_TS/],
  ["browser URL constructor", 'export const value = new URL("https://example.invalid");', /^PORTABLE_TYPES_TS/],
  ["suppressed DOM type error", "// @ts-expect-error\nexport const value = document.title;", /^SUPPRESSED_PORTABLE_TYPES$/],
  ["ambient DOM reference", '/// <reference lib="dom" />\nexport {};', /^AMBIENT_REFERENCE$/],
  ["ambient declaration", "declare const document: { title: string };\nexport const value = document.title;", /^AMBIENT_DECLARATION$/],
  ["computed import", 'const target = "node:fs";\nexport const value = import(target);', /^DYNAMIC_PORTABLE_IMPORT$/],
  ["CommonJS require", 'export const value = require("node:fs");', /^DYNAMIC_PORTABLE_RUNTIME$/],
  ["dynamic runtime", 'export const value = new Function("return document.title");', /^DYNAMIC_PORTABLE_RUNTIME$/]
]) test(`rejects ${name} before portable code can be accepted`, async t => {
  const directory = fixture(t);
  writeFileSync(join(directory, sourceFile), code);
  await rejected(directory, finding);
});

test("a relative server import cannot escape the package", async t => {
  const directory = fixture(t);
  writeFileSync(join(directory, sourceFile), 'export * from "../../../lib/platform/api-contracts";');
  await rejected(directory, /^SOURCE_ESCAPE$/);
});

test("the wire contract also excludes server and browser imports", async t => {
  const directory = fixture(t);
  edit(directory, wireFile, 'export const API_VERSION', 'import "next/headers";\nexport const API_VERSION');
  await rejected(directory, /^EXTERNAL_PORTABLE_IMPORT$/);
});

for (const [name, mutate, finding] of [
  ["export escape", manifest => { manifest.exports["."].default = "../../lib/platform/api-contracts.ts"; }, /^PACKAGE_EXPORT_ESCAPE$/],
  ["wildcard export", manifest => { manifest.exports["./*"] = manifest.exports["."]; }, /^PACKAGE_EXPORTS$/],
  ["extra runtime export condition", manifest => { manifest.exports["."].browser = manifest.exports["."].default; }, /^PACKAGE_EXPORTS$/],
  ["runtime dependency", manifest => { manifest.dependencies = { next: "*" }; }, /^PACKAGE_RUNTIME_DEPENDENCY$/]
]) test(`rejects package ${name}`, async t => {
  const directory = fixture(t);
  editJson(directory, "packages/shared-core/package.json", mutate);
  await rejected(directory, finding);
});

test("package configuration cannot broaden to DOM or ambient Node types", async t => {
  const directory = fixture(t);
  editJson(directory, "packages/shared-core/tsconfig.json", config => {
    config.compilerOptions.lib.push("DOM");
    config.compilerOptions.types = ["node"];
  });
  await rejected(directory, /^PACKAGE_TYPE_ENVIRONMENT$/);
});

test("a declaration-only entry cannot masquerade as the package runtime", async t => {
  const directory = fixture(t);
  writeFileSync(join(directory, "packages/shared-core/src/runtime.d.ts"), "export const value: string;\n");
  editJson(directory, "packages/shared-core/package.json", manifest => {
    manifest.main = "./src/runtime.d.ts";
    manifest.exports["."].default = manifest.main;
    manifest.exports["."]["react-native"] = manifest.main;
  });
  await rejected(directory, /^DECLARATION_ONLY_SOURCE$/);
});

test("source symlinks cannot smuggle files from outside the reviewed package", async t => {
  const directory = fixture(t);
  symlinkSync(join(directory, wireFile), join(directory, sourceFile));
  await rejected(directory, /^SOURCE_SYMLINK$/);
});

for (const [name, before, after, finding] of [
  ["unknown post discriminator", '["TESTIMONY", "PRAYER", "TEACHING", "UPDATE", "NEED"]', '["TESTIMONY", "PRAYER", "TEACHING", "UPDATE", "NEED", "ANNOUNCEMENT"]', /^WIRE_COMPATIBILITY_TS/],
  ["changed response field type", "commentCount: integer(),", "commentCount: text(30),", /^WIRE_COMPATIBILITY_TS/],
  ["new required write input", "object({ mutationId, expectedVersion: version, desired: boolean })", "object({ mutationId, expectedVersion: version, desired: boolean, confirmed: boolean })", /^WIRE_COMPATIBILITY_TS/],
  ["moved endpoint", '"/capabilities",', '"/new-capabilities",', /^WIRE_ENDPOINT_CHANGED$/],
  ["narrowed input validator", "export const apiId = text(100,", "export const apiId = text(5,", /^WIRE_REQUEST_INCOMPATIBLE$/],
  ["widened response cursor bound", "export const apiCursor = text(2000,", "export const apiCursor = text(4096,", /^WIRE_RESPONSE_BOUND_CHANGED$/]
]) test(`rejects v1 ${name}`, async t => {
  const directory = fixture(t);
  edit(directory, wireFile, before, after);
  await rejected(directory, finding);
});

test("diagnostics never echo rejected source text or literal values", async t => {
  const directory = fixture(t);
  const marker = "fictional-private-value-never-print";
  writeFileSync(join(directory, sourceFile), `export const value: number = "${marker}";`);
  const report = await rejected(directory, /^PORTABLE_TYPES_TS/);
  assert.equal(JSON.stringify(report).includes(marker), false);
  assert.deepEqual(Object.keys(report.findings[0]).sort(), ["code", "file"]);
});
