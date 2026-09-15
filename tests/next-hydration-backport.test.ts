import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const script = resolve("scripts/patch-next-hydration.mjs");
const files = ["react-dom", "react-dom-experimental"].flatMap((variant) =>
  ["production", "development"].map(
    (mode) => `dist/compiled/${variant}/cjs/react-dom-client.${mode}.js`
  )
);
const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "gc-hydration-backport-"));
  const next = join(root, "node_modules/next");
  mkdirSync(next, { recursive: true });
  writeFileSync(
    join(next, "package.json"),
    JSON.stringify({ version: "15.5.25" })
  );
  for (const file of files) {
    let source = readFileSync(resolve("node_modules/next", file), "utf8");
    // Recreate the unpatched, published fixture from an installed copy. The
    // installer's pinned whole-file hashes independently validate these bytes.
    const marker = source.indexOf("// Godschurches: React #35494");
    if (marker !== -1) {
      const start = source.lastIndexOf("\n", marker) + 1;
      const end = source.indexOf("default:", marker);
      const nextLine = source.lastIndexOf("\n", end) + 1;
      source = source.slice(0, start) + source.slice(nextLine);
    }
    mkdirSync(dirname(join(next, file)), { recursive: true });
    writeFileSync(join(next, file), source);
  }
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [script, ...args], {
      cwd: root,
      encoding: "utf8"
    });
  const fingerprints = () =>
    files.map((f) => digest(readFileSync(join(next, f), "utf8")));
  return {
    root,
    next,
    run,
    fingerprints,
    cleanup: () => rmSync(root, { recursive: true, force: true })
  };
}

test("the deployed dependency install includes the reviewed renderer fix", () => {
  const result = spawnSync(process.execPath, [script, "--check"], {
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /4 renderers verified, 0 applied/);
});
test("a clean pinned install patches all renderers once and cached builds remain byte-identical", () => {
  const f = fixture();
  try {
    assert.notEqual(f.run("--check").status, 0);
    const before = f.fingerprints(),
      first = f.run();
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /4 renderers verified, 4 applied/);
    const patched = f.fingerprints();
    assert.ok(patched.every((value, i) => value !== before[i]));
    assert.equal(f.run().status, 0);
    assert.equal(f.run("--check").status, 0);
    assert.deepEqual(f.fingerprints(), patched);
    for (const file of files)
      assert.equal(
        spawnSync(process.execPath, ["--check", join(f.next, file)]).status,
        0
      );
  } finally {
    f.cleanup();
  }
});
test("unexpected bytes in the last renderer stop the whole install before any writes", () => {
  const f = fixture();
  try {
    const last = join(f.next, files.at(-1)!);
    writeFileSync(
      last,
      readFileSync(last, "utf8") + "\n// Changed dependency\n"
    );
    const before = f.fingerprints(),
      result = f.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unexpected renderer bytes/);
    assert.deepEqual(f.fingerprints(), before);
  } finally {
    f.cleanup();
  }
});
test("a future Next version requires explicit review without changing renderer files", () => {
  const f = fixture();
  try {
    writeFileSync(
      join(f.next, "package.json"),
      JSON.stringify({ version: "16.3.5" })
    );
    const before = f.fingerprints(),
      result = f.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Review\/remove/);
    assert.deepEqual(f.fingerprints(), before);
  } finally {
    f.cleanup();
  }
});
test("a changed cached patch cannot pass integrity verification", () => {
  const f = fixture();
  try {
    assert.equal(f.run().status, 0);
    const first = join(f.next, files[0]);
    writeFileSync(
      first,
      readFileSync(first, "utf8").replace(
        "nextHydratableInstance = next.stateNode;",
        "nextHydratableInstance = null;"
      )
    );
    const before = f.fingerprints(),
      result = f.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unexpected renderer bytes/);
    assert.deepEqual(f.fingerprints(), before);
  } finally {
    f.cleanup();
  }
});
