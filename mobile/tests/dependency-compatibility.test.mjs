import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const require = createRequire(new URL("../package.json", import.meta.url));
const metroRequire = createRequire(require.resolve("metro-file-map"));
const micromatch = metroRequire("micromatch");
const { includedByGlob } = require("metro-file-map/private/watchers/common");
const xcode = require("xcode");
const xcodeRequire = createRequire(require.resolve("xcode"));

test("Metro's actual file filter preserves extension, directory and dot-path behavior", () => {
  // This exercises Metro's micromatch.some consumer, which uses picomatch.
  // Brace processor depth protection is checked separately below.
  const globs = ["**/*.{js,ts}"];
  assert.equal(includedByGlob("f", globs, false, "src/example.ts"), true);
  assert.equal(includedByGlob("f", globs, false, "src/example.png"), false);
  assert.equal(includedByGlob("f", globs, false, "src/.hidden.ts"), false);
  assert.equal(includedByGlob("f", globs, true, "src/.hidden.ts"), true);
  assert.equal(includedByGlob("f", [], false, "src/example.png"), true);
  assert.equal(includedByGlob("f", [], false, ".hidden/example.ts"), false);
  assert.equal(includedByGlob("d", globs, false, "src/assets"), true);
  assert.equal(includedByGlob("d", globs, false, ".cache"), false);
  assert.equal(includedByGlob("d", globs, true, ".cache"), true);
});

test("Metro-resolved micromatch preserves ordinary brace expansion and bounds deep input", () => {
  assert.deepEqual(micromatch.braceExpand("src/{one,{two,three}}.{js,ts}"), [
    "src/one.js", "src/one.ts", "src/two.js", "src/two.ts", "src/three.js", "src/three.ts"
  ]);
  assert.deepEqual(micromatch.braceExpand("item-{01..03}"), ["item-01", "item-02", "item-03"]);
  const nested = depth => "{".repeat(depth) + "x" + "}".repeat(depth);
  for (const operation of [micromatch.parse, micromatch.braceExpand]) {
    assert.doesNotThrow(() => operation(nested(100)));
    for (const depth of [101, 1000]) {
      assert.throws(() => operation(nested(depth)), { name: "SyntaxError", message: /Input depth \(101\)/ });
    }
  }
});

test("xcode's real UUID consumer adds distinct groups that survive a project round trip", t => {
  const root = mkdtempSync(join(tmpdir(), "gc-xcode-dependency-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, "input.pbxproj");
  // Minimal OpenStep project sections used by xcode's upstream empty-group test.
  // https://github.com/apache/cordova-node-xcode/blob/ecdbf56a1d4fc4bea3c0f25e4679efab47ff32eb/test/parser/projects/empty-groups.pbxproj
  writeFileSync(path, `// !$*UTF8*$!
{
  archiveVersion = 1;
  classes = {};
  objectVersion = 45;
  objects = {
/* Begin PBXFileReference section */
/* End PBXFileReference section */
/* Begin PBXBuildFile section */
/* End PBXBuildFile section */
/* Begin PBXGroup section */
/* End PBXGroup section */
  };
  rootObject = AAAAAAAAAAAAAAAAAAAAAAAA;
}
`);
  const project = xcode.project(path).parseSync();
  const first = project.addPbxGroup([], "DependencyProbeOne", "DependencyProbeOne");
  const second = project.addPbxGroup([], "DependencyProbeTwo", "DependencyProbeTwo");
  assert.match(first.uuid, /^[A-F0-9]{24}$/);
  assert.match(second.uuid, /^[A-F0-9]{24}$/);
  assert.notEqual(first.uuid, second.uuid);
  const output = join(root, "output.pbxproj");
  writeFileSync(output, project.writeSync());
  const roundTrip = xcode.project(output).parseSync();
  for (const group of [first, second]) {
    const parsed = roundTrip.hash.project.objects.PBXGroup[group.uuid];
    assert.ok(parsed);
    // Parsed dictionaries have null prototypes; compare the meaningful fields.
    for (const field of ["isa", "name", "path", "sourceTree"])
      assert.equal(parsed[field], group.pbxGroup[field]);
    assert.deepEqual(parsed.children, []);
  }
  assert.match(readFileSync(output, "utf8"), /DependencyProbeOne/);
});

test("xcode-resolved UUID rejects undersized and overflowing output buffers", () => {
  const uuid = xcodeRequire("uuid");
  for (const version of [uuid.v3, uuid.v5]) {
    assert.throws(() => version("fictional", version.DNS, new Uint8Array(15)), RangeError);
    assert.throws(() => version("fictional", version.DNS, new Uint8Array(16), 1), RangeError);
    const bytes = new Uint8Array(16);
    assert.equal(version("fictional", version.DNS, bytes), bytes);
  }
});
