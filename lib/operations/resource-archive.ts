// Operator-only asset rehearsal. No application route imports this module.
import assert from "node:assert/strict";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";

const FORMAT = "gc-resource-assets-v1";
const MAX_ENTRY = 4 * 1024 * 1024;
const MAX_BYTES = 256 * 1024 * 1024;
const MAX_ARCHIVE = Math.ceil((MAX_BYTES * 4) / 3) + 2 * 1024 * 1024;
const validKey = (key: unknown): key is string =>
  typeof key === "string" &&
  /^images\/[a-f0-9-]{36}\/(original|large|medium|thumb)\.webp$/.test(key);
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
export type ArchiveEntry = { key: string; bytes: number };
type Locations = { archive: string; key: string; manifest: string };
type Manifest = {
  format: string;
  createdAt: string;
  iv: string;
  tag: string;
  encryptedSha256: string;
  entries: number;
  bytes: number;
};
async function privateDirectory(path: string) {
  const s = await lstat(path);
  assert.ok(
    s.isDirectory() && !s.isSymbolicLink() && !(s.mode & 0o077),
    "Use a private directory without symbolic links"
  );
}
async function privateFile(path: string, maximum: number) {
  const s = await lstat(path);
  assert.ok(
    s.isFile() &&
      !s.isSymbolicLink() &&
      s.nlink === 1 &&
      !(s.mode & 0o077) &&
      s.size > 0 &&
      s.size <= maximum,
    "Use a bounded private regular file without links"
  );
  return s;
}
function entryMap(entries: ArchiveEntry[]) {
  assert.ok(entries.length > 0 && entries.length <= 4000);
  const found = new Map<string, number>();
  let total = 0;
  for (const entry of entries) {
    assert.ok(
      validKey(entry.key) &&
        Number.isSafeInteger(entry.bytes) &&
        entry.bytes > 0 &&
        entry.bytes <= MAX_ENTRY
    );
    assert.ok(!found.has(entry.key), "Duplicate asset key");
    found.set(entry.key, entry.bytes);
    total += entry.bytes;
  }
  assert.ok(total <= MAX_BYTES, "Use a bounded asset rehearsal");
  return found;
}

export async function writeResourceArchive(
  paths: Locations,
  entries: ArchiveEntry[],
  read: (key: string) => Promise<Buffer | null>
) {
  const expected = entryMap(entries);
  const parent = dirname(resolve(paths.archive));
  assert.notEqual(
    parent,
    dirname(resolve(paths.key)),
    "Keep the key separate from the archive"
  );
  assert.equal(parent, dirname(resolve(paths.manifest)));
  await privateDirectory(parent);
  await privateDirectory(dirname(resolve(paths.key)));
  // Reserve every output before creating an archive; never overwrite an earlier run.
  for (const file of Object.values(paths))
    await assert.rejects(lstat(file), { code: "ENOENT" });
  const key = randomBytes(32),
    iv = randomBytes(12),
    createdAt = new Date().toISOString();
  await writeFile(paths.key, key, { mode: 0o600, flag: "wx" });
  const cipher = createCipheriv("aes-256-gcm", key, iv),
    digest = createHash("sha256");
  let bytes = 0;
  async function* records() {
    yield JSON.stringify({ format: FORMAT, createdAt }) + "\n";
    for (const [key, size] of expected) {
      const body = await read(key);
      assert.ok(body, `Missing source asset: ${key}`);
      assert.equal(body.length, size, `Source asset size changed: ${key}`);
      bytes += body.length;
      yield JSON.stringify({
        key,
        bytes: body.length,
        sha256: hash(body),
        body: body.toString("base64")
      }) + "\n";
    }
  }
  await pipeline(
    Readable.from(records()),
    cipher,
    new Transform({
      transform(chunk, _encoding, next) {
        digest.update(chunk);
        next(null, chunk);
      }
    }),
    createWriteStream(paths.archive, { mode: 0o600, flags: "wx" })
  );
  const manifest: Manifest = {
    format: FORMAT,
    createdAt,
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    encryptedSha256: digest.digest("hex"),
    entries: expected.size,
    bytes
  };
  await writeFile(paths.manifest, JSON.stringify(manifest), {
    mode: 0o600,
    flag: "wx"
  });
  return { entries: manifest.entries, bytes };
}

export async function restoreResourceArchive(
  paths: Locations,
  entries: ArchiveEntry[],
  destination: string
) {
  const expected = entryMap(entries);
  await privateDirectory(dirname(resolve(destination)));
  await assert.rejects(lstat(destination), { code: "ENOENT" });
  await privateFile(paths.archive, MAX_ARCHIVE);
  assert.equal((await privateFile(paths.key, 32)).size, 32);
  await privateFile(paths.manifest, 4096);
  const manifest = JSON.parse(
    await readFile(paths.manifest, "utf8")
  ) as Manifest;
  assert.equal(manifest.format, FORMAT);
  assert.match(manifest.iv, /^[a-f0-9]{24}$/);
  assert.match(manifest.tag, /^[a-f0-9]{32}$/);
  assert.match(manifest.encryptedSha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.entries, expected.size);
  assert.equal(
    manifest.bytes,
    [...expected.values()].reduce((a, b) => a + b, 0)
  );
  const key = await readFile(paths.key);
  const decipher = () => {
    const d = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(manifest.iv, "hex")
    );
    d.setAuthTag(Buffer.from(manifest.tag, "hex"));
    return d;
  };
  // Authenticate the complete archive before any decrypted asset reaches disk.
  const digest = createHash("sha256");
  await pipeline(
    createReadStream(paths.archive),
    new Transform({
      transform(chunk, _encoding, next) {
        digest.update(chunk);
        next(null, chunk);
      }
    }),
    decipher(),
    new Writable({
      write(_chunk, _encoding, next) {
        next();
      }
    })
  );
  assert.equal(digest.digest("hex"), manifest.encryptedSha256);
  const stage = await mkdtemp(
    join(dirname(resolve(destination)), ".asset-restore-")
  );
  const seen = new Set<string>();
  let bytes = 0,
    header = false;
  const decrypt = decipher();
  const reading = pipeline(createReadStream(paths.archive), decrypt);
  // Always observe stream failure, including authentication failure on a changed
  // source file between passes. Publish the staged directory only after completion.
  void reading.catch(() => {});
  try {
    const lines = createInterface({ input: decrypt, crlfDelay: Infinity });
    for await (const line of lines) {
      assert.ok(line.length <= Math.ceil((MAX_ENTRY * 4) / 3) + 1024);
      const row = JSON.parse(line);
      if (!header) {
        assert.deepEqual(row, {
          format: FORMAT,
          createdAt: manifest.createdAt
        });
        header = true;
        continue;
      }
      assert.ok(
        validKey(row.key) && !seen.has(row.key) && expected.has(row.key),
        "Unexpected or duplicate restored asset"
      );
      assert.equal(row.bytes, expected.get(row.key));
      assert.equal(typeof row.body, "string");
      const body = Buffer.from(row.body, "base64");
      assert.equal(body.toString("base64"), row.body);
      assert.equal(body.length, row.bytes);
      assert.equal(hash(body), row.sha256);
      const file = join(stage, row.key);
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      await writeFile(file, body, { mode: 0o600, flag: "wx" });
      seen.add(row.key);
      bytes += body.length;
    }
    await reading;
    assert.equal(seen.size, expected.size, "Missing restored assets");
    assert.equal(bytes, manifest.bytes);
    await rename(stage, destination);
    return { entries: seen.size, bytes, missing: 0, orphaned: 0 };
  } catch (error) {
    decrypt.destroy();
    await reading.catch(() => {});
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
}
