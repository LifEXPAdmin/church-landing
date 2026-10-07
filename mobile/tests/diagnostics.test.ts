import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { runDiagnosticProbe } from "../src/platform/diagnostics.ts";

const context = { platform: "android", platformVersion: 36, appVersion: "0.0.1", variant: "development",
  sourceBase: "1234567890abcdef1234567890abcdef12345678", sourceState: "modified" };

test("synthetic failure retains build provenance without inspecting private payloads", () => {
  const metadata = {
    ...context,
    authorization: "Bearer fictional-secret",
    body: { prayer: "fictional private prayer", dm: "fictional private message" },
    url: "https://example.test/private?token=fictional-secret",
    get error() { assert.fail("A raw error must never be inspected"); },
    toJSON() { assert.fail("The supplied object must never be serialized"); }
  };
  const result = runDiagnosticProbe(metadata);
  assert.deepEqual(result, { schema: 1, code: "synthetic_probe", ...context, platformVersion: "36" });
  assert.equal(Object.isFrozen(result), true);
  const text = JSON.stringify(result);
  assert.ok(text.length < 512);
  assert.equal(/fictional|authorization|body|url|error|prayer|dm/i.test(text), false);
  metadata.platformVersion = 35;
  assert.equal(result.platformVersion, "36", "The report cannot retain mutable input");
});

test("invalid or oversized diagnostic metadata is omitted without coercing objects", () => {
  const trap = { toString() { assert.fail("Never coerce a supplied object"); } };
  const report = runDiagnosticProbe({ platform: trap, platformVersion: trap,
    appVersion: "1.0.0\nsecret", variant: "production", sourceBase: "x".repeat(10000), sourceState: "clean" });
  assert.deepEqual(report, { schema: 1, code: "synthetic_probe", platform: null, platformVersion: null,
    appVersion: null, variant: null, sourceBase: null, sourceState: "unknown" });
  assert.deepEqual(runDiagnosticProbe(null), report);
  assert.deepEqual(runDiagnosticProbe([]), report);
});

test("platform versions and source uncertainty remain explicit", () => {
  assert.equal(runDiagnosticProbe({ ...context, platformVersion: Infinity }).platformVersion, null);
  assert.equal(runDiagnosticProbe({ ...context, platformVersion: -1 }).platformVersion, null);
  assert.equal(runDiagnosticProbe({ ...context, platformVersion: 36.5 }).platformVersion, null);
  assert.equal(runDiagnosticProbe({ ...context, platform: "ios", platformVersion: "18.5.1" }).platformVersion, "18.5.1");
  assert.equal(runDiagnosticProbe({ ...context, platform: "ios", platformVersion: "18.5/secret" }).platformVersion, null);
  assert.equal(runDiagnosticProbe({ ...context, sourceState: "mutable" }).sourceState, "mutable");
  assert.equal(runDiagnosticProbe({ ...context, sourceState: "claimed-release" }).sourceState, "unknown");
});

test("changing getters cannot substitute unvalidated objects into a report", () => {
  const reads: Record<string, number> = {};
  const trap = { token: "fictional-private-token", toString() { assert.fail("Do not coerce a later object"); } };
  const metadata = Object.fromEntries(Object.entries(context).map(([key]) => [key, undefined]));
  for (const [key, value] of Object.entries(context)) {
    Object.defineProperty(metadata, key, { get() { reads[key] = (reads[key] ?? 0) + 1; return reads[key] === 1 ? value : trap; } });
  }
  const result = runDiagnosticProbe(metadata);
  assert.deepEqual(result, { schema: 1, code: "synthetic_probe", ...context, platformVersion: "36" });
  assert.deepEqual(Object.values(reads), Array(Object.keys(context).length).fill(1));
  assert.equal(Object.values(result).some((value) => typeof value === "object" && value !== null), false);
});

test("build identity pins the selected variant before Expo dotenv loading", () => {
  // An isolated process reads only a fictional env file, never the app's local env.
  const script = `
    import { mobileBuildEnv } from './scripts/build-identity.mjs';
    import { loadEnvFiles } from '@expo/env';
    import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
    import { join } from 'node:path';
    import { tmpdir } from 'node:os';
    if (!process.env.APP_VARIANT) delete process.env.APP_VARIANT;
    const root = mkdtempSync(join(tmpdir(), 'mobile-variant-'));
    try {
      const path = join(root, '.env');
      writeFileSync(path, 'APP_VARIANT=' + (process.env.APP_VARIANT ? 'development' : 'staging') + '\\n');
      const stamp = mobileBuildEnv();
      const childEnv = {...process.env, ...stamp};
      loadEnvFiles([path], { systemEnv: childEnv, force: true, silent: true });
      console.log(JSON.stringify({ stamp: stamp.EXPO_PUBLIC_APP_VARIANT, actual: childEnv.APP_VARIANT }));
    } finally { rmSync(root, { recursive: true }); }
  `;
  for (const variant of ["", "staging"]) {
    const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: new URL("..", import.meta.url), encoding: "utf8",
      env: { ...process.env, APP_VARIANT: variant, EXPO_NO_DOTENV: "0" }
    }));
    assert.deepEqual(result, { stamp: variant || "development", actual: variant || "development" });
  }
});
