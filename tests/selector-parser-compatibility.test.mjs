import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { compareReports, outputKeys, runWorker } from "../scripts/verify-selector-parser-compatibility.mjs";

function reports() {
  const outputs = Object.fromEntries(outputKeys.map(key => [key, ".group-hover { --tw-test: 1; }"]));
  const consumers = { tailwind: "3.4.19", nested: "6.2.0", tailwindParser: "6.1.4", nestedParser: "6.1.4" };
  return [{ consumers, outputs }, { consumers: { ...consumers, tailwindParser: "7.1.6", nestedParser: "7.1.6" }, outputs: { ...outputs } }];
}
test("both consumers must use the upgraded parser", () => {
  const [baseline, candidate] = reports();
  assert.equal(Object.keys(compareReports(baseline, candidate)).length, outputKeys.length);
  candidate.consumers.nestedParser = "6.1.4";
  assert.throws(() => compareReports(baseline, candidate), /nesting parser/);
});
test("different parents cannot masquerade as a parser-only comparison", () => {
  const [baseline, candidate] = reports(); candidate.consumers.tailwind = "4.0.0";
  assert.throws(() => compareReports(baseline, candidate), /Tailwind version/);
});
test("matching missing or empty output never passes", () => {
  const [baseline, candidate] = reports();
  delete baseline.outputs["selector:0"]; delete candidate.outputs["selector:0"];
  assert.throws(() => compareReports(baseline, candidate), /incomplete outputs/);
  const [a, b] = reports(); a.outputs["nested:0"] = b.outputs["nested:0"] = "";
  assert.throws(() => compareReports(a, b), /empty output/);
});
test("selector, nesting and real stylesheet changes are rejected", () => {
  for (const key of ["selector:2", "nested:1", "app/globals.css", "app/platform/platform.css"]) {
    const [baseline, candidate] = reports(); candidate.outputs[key] += " .changed { color: red }";
    assert.throws(() => compareReports(baseline, candidate), /Output changed/);
  }
});
test("missing dependency tree or project cannot produce passing empty reports", () => {
  assert.throws(() => runWorker("/nonexistent-selector-parser-install", "/nonexistent-selector-parser-project"), /Compatibility worker failed/);
});
test("a symlink invocation executes the CLI instead of silently succeeding", { skip: process.platform === "win32" }, () => {
  const directory = mkdtempSync(join(tmpdir(), "selector-cli-"));
  try {
    const link = join(directory, "verify.mjs");
    symlinkSync(fileURLToPath(new URL("../scripts/verify-selector-parser-compatibility.mjs", import.meta.url)), link);
    const result = spawnSync(process.execPath, [link], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: --baseline/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
