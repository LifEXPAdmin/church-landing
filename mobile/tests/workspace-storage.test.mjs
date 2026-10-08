import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareWorkspaceDirectories, verifyWorkspaceDirectory, verifyWorkspaceStorage, verifyWorkspaceWritePaths } from "../scripts/workspace-storage.mjs";

const uuid = "11111111-2222-3333-4444-555555555555";
const otherUuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gc-mobile-storage-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const storageRoot = join(root, "task");
  const website = join(storageRoot, "source");
  const mobile = join(website, "mobile");
  const mount = join(root, "data-mount");
  const home = join(root, "home");
  for (const dir of [mobile, mount, home]) mkdirSync(dir, { recursive: true });
  const path = join(root, "profile.json");
  const profile = { schema: 1, kind: "internal", hostname: "fictional-mac", volumeUUID: uuid, storageRoot, workspaceRoot: website, minimumFreeGiB: 32 };
  const save = (value = profile, file = path) => {
    writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
    return file;
  };
  save();
  const disk = { VolumeUUID: uuid, Internal: true, WritableVolume: true, Locked: false, FilesystemType: "apfs", MountPoint: mount };
  const ops = { platform: "darwin", hostname: () => "fictional-mac", home: () => home, diskInfo: () => disk, statfs: () => ({ bavail: 40, bsize: 1024 ** 3 }) };
  const env = { GC_MOBILE_HOST_PROFILE: path };
  const options = { website, mobile, env };
  return { root, storageRoot, website, mobile, mount, home, path, profile, save, disk, ops, env, options };
}

test("explicit internal profile binds a writable Data device without lexical mount containment", (t) => {
  const f = fixture(t);
  const result = verifyWorkspaceStorage(f.options, f.ops);
  assert.equal(result.kind, "internal");
  assert.equal(result.minimumFreeGiB, 32);
  assert.equal(result.freeGiB, 40);
  assert.equal(result.device, statSync(f.mount).dev);
  assert.equal(result.website, f.website);
  assert(!f.mobile.startsWith(f.mount + "/"));
  const prepared = prepareWorkspaceDirectories(result, f.ops);
  assert.equal(prepared.generated, join(f.mobile, ".generated"));
  for (const child of ["npm-cache", "tmp", "expo-home", "cache"])
    assert(statSync(join(prepared.generated, child)).isDirectory());
  assert(!existsSync(join(prepared.generated, "write-proof-" + process.pid)));
  // The file is read as supplied, never rewritten with discovered host values.
  assert.deepEqual(JSON.parse(readFileSync(f.path, "utf8")), f.profile);
});

test("host, UUID, schema, precise roots and headroom are mandatory without fallback", (t) => {
  const f = fixture(t);
  for (const change of [
    { schema: 2 }, { kind: "external" }, { hostname: "another-mac" },
    { volumeUUID: "invalid" }, { minimumFreeGiB: 31 }, { minimumFreeGiB: 32.5 },
    { storageRoot: "/" }, { storageRoot: f.home }, { storageRoot: f.root },
    { workspaceRoot: f.storageRoot }, { workspaceRoot: "source" }, { unknown: true }
  ]) {
    f.save({ ...f.profile, ...change });
    assert.throws(() => verifyWorkspaceStorage(f.options, f.ops));
  }
  f.save();
  for (const env of [
    { GC_MOBILE_HOST_PROFILE: "profile.json", GC_MOBILE_VOLUME_UUID: uuid },
    { GC_MOBILE_HOST_PROFILE: "", GC_MOBILE_VOLUME_UUID: uuid },
    { GC_MOBILE_HOST_PROFILE: join(f.root, "missing.json"), GC_MOBILE_VOLUME_UUID: uuid },
    { ...f.env, GC_MOBILE_VOLUME_UUID: otherUuid }
  ]) assert.throws(() => verifyWorkspaceStorage({ ...f.options, env }, f.ops));
  assert.throws(() => verifyWorkspaceStorage(f.options, { ...f.ops, statfs: () => ({ bavail: 31, bsize: 1024 ** 3 }) }));
  assert.throws(() => verifyWorkspaceStorage(f.options, { ...f.ops, platform: "linux" }));
  assert.equal(verifyWorkspaceStorage({ ...f.options, env: { ...f.env, GC_MOBILE_VOLUME_UUID: uuid.toLowerCase() } }, f.ops).kind, "internal");
});

test("public, permissive and symlinked public profile files are rejected", (t) => {
  const f = fixture(t);
  const publicFile = f.save(f.profile, join(f.website, "public-profile.json"));
  assert.throws(() => verifyWorkspaceStorage({ ...f.options, env: { GC_MOBILE_HOST_PROFILE: publicFile } }, f.ops));
  const alias = join(f.root, "profile-alias.json");
  symlinkSync(publicFile, alias);
  assert.throws(() => verifyWorkspaceStorage({ ...f.options, env: { GC_MOBILE_HOST_PROFILE: alias } }, f.ops));
  chmodSync(f.path, 0o644);
  assert.throws(() => verifyWorkspaceStorage(f.options, f.ops));
});

test("internal admission rejects read-only, external, locked, wrong UUID and wrong filesystem volumes", (t) => {
  const f = fixture(t);
  for (const change of [
    { WritableVolume: false }, { Internal: false }, { Locked: true },
    { VolumeUUID: otherUuid }, { FilesystemType: "hfs" }, { MountPoint: "relative" }
  ]) assert.throws(() => verifyWorkspaceStorage(f.options, { ...f.ops, diskInfo: () => ({ ...f.disk, ...change }) }));
  const stat = (path) => path === f.mount ? { ...statSync(path), isDirectory: () => true, dev: -1 } : statSync(path);
  assert.throws(() => verifyWorkspaceStorage(f.options, { ...f.ops, stat }));
});

test("default mode still requires external UUID and Codex Storage with four GiB", (t) => {
  const f = fixture(t);
  const website = join(f.mount, "Codex Storage", "task", "source");
  const mobile = join(website, "mobile");
  mkdirSync(mobile, { recursive: true });
  const options = { website, mobile, env: { GC_MOBILE_VOLUME_UUID: uuid } };
  const ops = { ...f.ops, diskInfo: () => ({ ...f.disk, Internal: false }), statfs: () => ({ bavail: 4, bsize: 1024 ** 3 }) };
  assert.equal(verifyWorkspaceStorage(options, ops).kind, "external");
  assert.equal(verifyWorkspaceStorage(options, ops).minimumFreeGiB, 4);
  assert.throws(() => verifyWorkspaceStorage({ ...options, env: {} }, ops));
  assert.throws(() => verifyWorkspaceStorage(options, f.ops));
  assert.throws(() => verifyWorkspaceStorage(options, { ...ops, statfs: () => ({ bavail: 3, bsize: 1024 ** 3 }) }));
  assert.throws(() => verifyWorkspaceStorage({ ...options, website: f.website, mobile: f.mobile }, ops));
});

test("write entry and generated descendant escapes fail before mkdir creates external output", (t) => {
  const f = fixture(t);
  const verified = verifyWorkspaceStorage(f.options, f.ops);
  const outside = join(f.root, "unowned");
  mkdirSync(outside);
  for (const name of ["node_modules", "ios", "android", ".generated"]) {
    const path = join(f.mobile, name);
    symlinkSync(outside, path);
    assert.throws(() => prepareWorkspaceDirectories(verified, f.ops));
    assert(!existsSync(join(outside, "npm-cache")));
    rmSync(path);
  }
  mkdirSync(join(f.mobile, "ios"));
  symlinkSync(outside, join(f.mobile, "ios", "Pods"));
  assert.throws(() => prepareWorkspaceDirectories(verified, f.ops));
  assert(!existsSync(join(f.mobile, ".generated")));
  rmSync(join(f.mobile, "ios"), { recursive: true });
  const generated = join(f.mobile, ".generated");
  mkdirSync(generated);
  symlinkSync(outside, join(generated, "ios"));
  assert.throws(() => prepareWorkspaceDirectories(verified, f.ops));
  assert(!existsSync(join(outside, "development")));
  rmSync(join(generated, "ios"));
  symlinkSync(join(f.root, "missing"), join(generated, "tmp"));
  assert.throws(() => prepareWorkspaceDirectories(verified, f.ops));
  assert(!existsSync(join(f.root, "missing")));
});

test("legitimate shared-core, npm binary and Pod header links remain usable", (t) => {
  const f = fixture(t);
  const verified = verifyWorkspaceStorage(f.options, f.ops);
  const shared = join(f.website, "packages", "shared-core");
  const dependency = join(f.mobile, "node_modules", "example");
  for (const path of [shared, dependency, join(f.mobile, "node_modules", "@godschurches"), join(f.mobile, "node_modules", ".bin"), join(f.mobile, "ios", "Pods", "Headers")]) mkdirSync(path, { recursive: true });
  writeFileSync(join(dependency, "cli.js"), "// fictional CLI\n");
  symlinkSync(shared, join(f.mobile, "node_modules", "@godschurches", "shared-core"));
  symlinkSync("../example/cli.js", join(f.mobile, "node_modules", ".bin", "example"));
  symlinkSync(dependency, join(f.mobile, "ios", "Pods", "Headers", "Example"));
  verifyWorkspaceWritePaths(verified, f.ops);
  prepareWorkspaceDirectories(verified, f.ops);
  verifyWorkspaceDirectory(verified, join(f.mobile, "node_modules", "@godschurches", "shared-core"), f.ops);
  assert.throws(() => verifyWorkspaceDirectory(verified, join(f.website, "..", "unowned"), f.ops));
  assert.throws(() => verifyWorkspaceDirectory(verified, join(f.website + "-other", "output"), f.ops));
});

test("headroom is checked again immediately before output preparation", (t) => {
  const f = fixture(t);
  const verified = verifyWorkspaceStorage(f.options, f.ops);
  assert.throws(() => prepareWorkspaceDirectories(verified, { ...f.ops, statfs: () => ({ bavail: 31, bsize: 1024 ** 3 }) }));
  assert(!existsSync(join(f.mobile, ".generated")));
});
