import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = join(root, "packages/shared-core");
const source = join(packageRoot, "src");
const scratch = process.env.GC_SHARED_CORE_TMP;
assert.ok(scratch && isAbsolute(scratch), "Set GC_SHARED_CORE_TMP to existing task-owned generated storage");
const output = mkdtempSync(join(realpathSync(scratch), "shared-core-check-"));
const consumerRoot = join(output, "consumer");
mkdirSync(join(consumerRoot, "node_modules/@godschurches"), { recursive: true });
symlinkSync(packageRoot, join(consumerRoot, "node_modules/@godschurches/shared-core"));
const consumer = join(consumerRoot, "consumer.ts");
writeFileSync(consumer, `import { draftProblem, POST_TOPICS, destinationWebPath, parseDestinationPath, DraftController, prepareRequest, type RequestAdapter, type AppDestination, type PostDraft, type PrivateDraftPayload, type DraftState, type DraftTransport } from "@godschurches/shared-core";
export const draft: PostDraft = { content: "Hello", scripture: "", type: "UPDATE", topics: [POST_TOPICS[0]], audience: "PUBLIC" };
export const payload: PrivateDraftPayload = { ...draft, linkUrl: "", replyAudience: null, authorChurchId: null, audienceChurchId: null, eventOccurrenceId: null };
export const problem: string | null = draftProblem(draft);
export const transport: DraftTransport = async () => ({ status: 401, data: {} });
export type NativeSnapshot = Pick<DraftState, "hidden" | "ownerId" | "fields">;
export const nativeController = new DraftController(transport, () => "fixture-id", { schedule: () => 0, cancel: () => {} });
export const nativeRequest = (adapter: RequestAdapter) => prepareRequest(adapter, { path: "/api/platform/v1/session", method: "GET", decode: (value, identity) => ({ value, owner: identity.owner }) });
export const destination: AppDestination = { kind: "event", occurrenceId: "occurrence_1" };
export const path: string | null = destinationWebPath(destination);
export const incoming: AppDestination | null = parseDestinationPath("/platform/posts/post_1?comment=comment_1");
// @ts-expect-error Events require the occurrence identity, not a generic or parent event ID.
export const wrongEvent: AppDestination = { kind: "event", id: "parent_event" };
// @ts-expect-error legacy unresolved reply permission is not a boolean
export const invalid: PrivateDraftPayload = { ...payload, replyAudience: false };
`);
const config = ts.readConfigFile(join(packageRoot, "tsconfig.json"), ts.sys.readFile);
assert.ok(!config.error, "Shared package config must parse");
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, packageRoot);
assert.equal(parsed.errors.length, 0, "Shared package config must be valid");
assert.deepEqual(parsed.options.lib, ["lib.es2022.d.ts"], "Portable checks must exclude DOM libraries");
assert.deepEqual(parsed.options.types, [], "Portable checks must exclude ambient Node/framework types");
const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
assert.deepEqual(Object.keys(manifest.dependencies ?? {}), [], "Shared core has no runtime dependencies");
const program = ts.createProgram([...parsed.fileNames, consumer], parsed.options);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) throw Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: name => name, getCurrentDirectory: () => root, getNewLine: () => "\n"
}));
const beneath = (parent, file) => {
  const rel = relative(parent, file);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};
const sourceFiles = program.getSourceFiles().filter(file => !program.isSourceFileDefaultLibrary(file));
for (const file of sourceFiles) {
  assert.ok(file.fileName === consumer || beneath(source, file.fileName),
    `Unexpected dependency in native consumer: ${file.fileName}`);
}
const compiled = join(output, "compiled");
const emit = ts.createProgram(parsed.fileNames, {
  ...parsed.options, noEmit: false, module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10, rootDir: source,
  outDir: compiled, declaration: true
}).emit();
assert.ok(!emit.emitSkipped && emit.diagnostics.length === 0, "Portable source must emit cleanly");
// Prisma remains a server dependency. Check its schema's wire enum independently
// so changes cannot silently split the client and server category sets.
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const postEnum = schema.match(/enum PlatformPostType\s*\{([^}]+)\}/u)?.[1];
assert.ok(postEnum, "PlatformPostType enum must remain explicit");
const schemaTypes = postEnum.split("\n").map(line => line.replace(/\/\/.*$/u, "").trim()).filter(Boolean);
const run = spawnSync(process.execPath, ["--import", join(root, "tests/register.mjs"), "--test", join(root, "tests/shared-core.test.mjs")], {
  cwd: root, encoding: "utf8", timeout: 30000,
  env: { ...process.env, GC_SHARED_CORE_BUILD: compiled, GC_SHARED_CORE_SCHEMA_TYPES: JSON.stringify(schemaTypes) }
});
writeFileSync(join(output, "tests.txt"), run.stdout + run.stderr);
process.stdout.write(run.stdout + run.stderr);
assert.equal(run.status, 0, "Shared-core runtime checks must pass");
const receipt = { output, nativeConsumer: consumer, compiled, sourceFiles: sourceFiles.map(file => relative(root, file.fileName)), target: "ES2022", ambientTypes: [], dom: false, externalRuntimeDependencies: [], testsPassed: true };
writeFileSync(join(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt, null, 2));
