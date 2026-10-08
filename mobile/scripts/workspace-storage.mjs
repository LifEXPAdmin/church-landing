import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, realpathSync, statSync, statfsSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { isAbsolute, join, parse, relative, resolve } from "node:path";

const GiB = 1024 ** 3;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const writeRoots = [
  "node_modules", "ios", "ios/Pods", "ios/build", "android", "android/.gradle",
  "android/build", "android/app/build", "android/app/.cxx", ".expo", ".generated",
  ".generated/export", ".generated/toolchain", ".generated/cocoapods",
  ".generated/cocoapods-cache", ".generated/react-native-cache",
  ...["development", "staging"].flatMap((variant) => [
    `.generated/ios/${variant}`,
    ...["DerivedData", "Packages", "PackageCache", "ModuleCache"].map((name) => `.generated/ios/${variant}/${name}`)
  ])
];
const cacheDirectories = ["npm-cache", "tmp", "expo-home", "cache"];
const inside = (root, path) => {
  const child = relative(root, path);
  return child !== "" && child !== ".." && !child.startsWith("../") && !isAbsolute(child);
};
const within = (root, path) => path === root || inside(root, path);
function diskInfo(uuid) {
  const plist = execFileSync("diskutil", ["info", "-plist", uuid], { encoding: "utf8" });
  return JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", "-"], { input: plist, encoding: "utf8" }));
}
const defaults = { diskInfo, platform: process.platform, hostname, home: homedir, stat: statSync, statfs: statfsSync };
const fail = (message) => { throw new Error(message); };
function directory(path, ops) {
  const actual = realpathSync(path);
  if (!ops.stat(actual).isDirectory()) fail("Mobile storage paths must be existing directories.");
  return actual;
}
function freeSpace(mount, minimum, ops) {
  const free = ops.statfs(mount);
  const bytes = Number(free.bavail) * Number(free.bsize);
  if (!Number.isFinite(bytes) || bytes < minimum * GiB) fail(`Less than ${minimum} GiB remains on the verified mobile volume.`);
  return Math.floor(bytes / GiB);
}

/** Read-only admission. Internal storage always requires an explicit private host profile. */
export function verifyWorkspaceStorage({ website, mobile, env = process.env }, overrides = {}) {
  const ops = { ...defaults, ...overrides };
  if (ops.platform !== "darwin") fail("This launcher requires an explicitly prepared Mac storage policy.");
  const checkout = directory(website, ops);
  const actual = directory(mobile, ops);
  if (!inside(checkout, actual)) fail("Mobile workspace must stay inside its website checkout.");
  let kind = "external", minimumFreeGiB = 4, storage, uuid = env.GC_MOBILE_VOLUME_UUID;
  if (env.GC_MOBILE_HOST_PROFILE !== undefined) {
    const file = env.GC_MOBILE_HOST_PROFILE;
    if (!file || !isAbsolute(file)) fail("GC_MOBILE_HOST_PROFILE must name an absolute private JSON file.");
    const profileFile = realpathSync(file);
    const profileStat = statSync(profileFile);
    if (within(resolve(website), resolve(file)) || within(checkout, profileFile) || !profileStat.isFile() || (profileStat.mode & 0o077) !== 0)
      fail("The mobile host profile must be a private file outside the public checkout.");
    const profile = JSON.parse(readFileSync(profileFile, "utf8"));
    const fields = ["schema", "kind", "hostname", "volumeUUID", "storageRoot", "workspaceRoot", "minimumFreeGiB"];
    if (!profile || typeof profile !== "object" || Array.isArray(profile) || Object.keys(profile).length !== fields.length || fields.some((key) => !Object.hasOwn(profile, key)) || profile.schema !== 1 || profile.kind !== "internal" || profile.hostname !== ops.hostname() || typeof profile.volumeUUID !== "string" || !uuidPattern.test(profile.volumeUUID) || !Number.isSafeInteger(profile.minimumFreeGiB) || profile.minimumFreeGiB < 32)
      fail("The internal mobile host profile is invalid or belongs to another host.");
    for (const path of [profile.storageRoot, profile.workspaceRoot])
      if (typeof path !== "string" || !isAbsolute(path)) fail("Host profile roots must be absolute existing paths.");
    storage = directory(profile.storageRoot, ops);
    const home = directory(ops.home(), ops);
    if (storage === parse(storage).root || within(storage, home) || !inside(storage, checkout) || resolve(profile.workspaceRoot) !== resolve(website) || directory(profile.workspaceRoot, ops) !== checkout)
      fail("The host profile must bind a task storage root to this exact checkout.");
    if (uuid !== undefined && (typeof uuid !== "string" || uuid.toUpperCase() !== profile.volumeUUID.toUpperCase()))
      fail("GC_MOBILE_VOLUME_UUID conflicts with the internal host profile.");
    kind = "internal";
    uuid = profile.volumeUUID;
    minimumFreeGiB = profile.minimumFreeGiB;
  }
  if (typeof uuid !== "string" || !uuidPattern.test(uuid)) fail("Set GC_MOBILE_VOLUME_UUID from the private storage policy.");
  const disk = ops.diskInfo(uuid);
  if (typeof disk.VolumeUUID !== "string" || disk.VolumeUUID.toUpperCase() !== uuid.toUpperCase() || disk.WritableVolume !== true || disk.Internal !== (kind === "internal") || disk.Locked || typeof disk.MountPoint !== "string" || !isAbsolute(disk.MountPoint) || (kind === "internal" && disk.FilesystemType?.toLowerCase() !== "apfs"))
    fail("The configured writable, unlocked mobile volume is unavailable.");
  const mount = directory(disk.MountPoint, ops);
  if (kind === "external") {
    storage = directory(join(mount, "Codex Storage"), ops);
    if (!inside(mount, storage) || !inside(storage, actual)) fail("Mobile workspace must be inside the verified SSD storage root.");
  }
  const device = ops.stat(mount).dev;
  if ([storage, checkout, actual].some((path) => ops.stat(path).dev !== device)) fail("Storage and source must be on the verified mobile volume.");
  // /Users can be a Data-volume firmlink without being lexically beneath its
  // mount point. Exact profile roots plus the actual device establish the bind.
  return { kind, volumeUUID: disk.VolumeUUID, mount, storage, website: checkout, mobile: actual, device, minimumFreeGiB, freeGiB: freeSpace(mount, minimumFreeGiB, ops) };
}

/** Check every existing ancestor before creating or writing a known directory. */
export function verifyWorkspaceDirectory(storage, path, overrides = {}) {
  const ops = { ...defaults, ...overrides };
  const destination = resolve(path);
  if (!inside(storage.website, destination)) fail("A mobile write path leaves its owned checkout.");
  let current = storage.website;
  for (const part of relative(storage.website, destination).split("/")) {
    current = join(current, part);
    try { lstatSync(current); } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    // realpath also rejects dangling links. Check before mkdir can follow one.
    const actual = realpathSync(current);
    const entry = ops.stat(actual);
    if (!within(storage.website, actual) || entry.dev !== storage.device || !entry.isDirectory())
      fail("A mobile write path leaves its owned checkout or verified volume.");
  }
}

export function verifyWorkspaceWritePaths(storage, overrides = {}) {
  // npm and CocoaPods own their internal links, including the canonical
  // shared-core consumer and Pod headers. Validate write entry points without
  // walking the entire installed dependency tree on every launcher action.
  for (const path of [...writeRoots, ...cacheDirectories.map((name) => `.generated/${name}`)])
    verifyWorkspaceDirectory(storage, join(storage.mobile, path), overrides);
}

export function prepareWorkspaceDirectories(storage, overrides = {}) {
  verifyWorkspaceWritePaths(storage, overrides);
  const freeGiB = freeSpace(storage.mount, storage.minimumFreeGiB, { ...defaults, ...overrides });
  const generated = join(storage.mobile, ".generated");
  for (const path of [generated, ...cacheDirectories.map((name) => join(generated, name))]) mkdirSync(path, { recursive: true });
  verifyWorkspaceWritePaths(storage, overrides);
  const proof = join(generated, "write-proof-" + process.pid);
  let created = false;
  try {
    writeFileSync(proof, "mobile-storage-proof", { flag: "wx" });
    created = true;
    if (readFileSync(proof, "utf8") !== "mobile-storage-proof") fail("Mobile storage write/read verification failed.");
  } finally { if (created) unlinkSync(proof); }
  return { generated, freeGiB };
}
