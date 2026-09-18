import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  rm,
  readFile,
  writeFile,
  lstat,
  readdir,
  symlink
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  randomUUID,
  randomBytes,
  createCipheriv,
  createHash
} from "node:crypto";
import {
  writeResourceArchive,
  restoreResourceArchive
} from "../lib/operations/resource-archive";

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "gc-resource-archive-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "archives"), { mode: 0o700 });
  await mkdir(join(root, "keys"), { mode: 0o700 });
  const paths = {
    archive: join(root, "archives", "assets.enc"),
    key: join(root, "keys", "assets.key"),
    manifest: join(root, "archives", "assets.json")
  };
  const body = Buffer.from("private fictional image bytes " + randomUUID());
  const entries = [
    { key: `images/${randomUUID()}/original.webp`, bytes: body.length },
    { key: `images/${randomUUID()}/thumb.webp`, bytes: body.length }
  ];
  return { root, paths, body, entries, destination: join(root, "restored") };
}

test("an authenticated asset archive restores exact bytes and refuses to overwrite earlier evidence", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(
    await writeResourceArchive(f.paths, f.entries, async () => f.body),
    { entries: 2, bytes: 2 * f.body.length }
  );
  assert.ok(!(await readFile(f.paths.archive)).includes(f.body));
  assert.equal((await lstat(f.paths.archive)).mode & 0o077, 0);
  assert.deepEqual(
    await restoreResourceArchive(f.paths, f.entries, f.destination),
    { entries: 2, bytes: 2 * f.body.length, missing: 0, orphaned: 0 }
  );
  for (const entry of f.entries)
    assert.deepEqual(await readFile(join(f.destination, entry.key)), f.body);
  await assert.rejects(
    writeResourceArchive(f.paths, f.entries, async () => f.body)
  );
  await assert.rejects(
    restoreResourceArchive(f.paths, f.entries, f.destination)
  );
  for (const entry of f.entries)
    assert.deepEqual(await readFile(join(f.destination, entry.key)), f.body);
});

test("missing or changed-length source bytes never receive a completed archive manifest", async (t) => {
  for (const read of [async () => null, async () => Buffer.from("changed")]) {
    const f = await fixture(t);
    await assert.rejects(writeResourceArchive(f.paths, f.entries, read));
    await assert.rejects(lstat(f.paths.manifest), { code: "ENOENT" });
  }
});

test("wrong keys and corrupted ciphertext produce no restored files", async (t) => {
  for (const mode of ["key", "cipher"]) {
    const f = await fixture(t);
    await writeResourceArchive(f.paths, f.entries, async () => f.body);
    if (mode === "key") await writeFile(f.paths.key, randomBytes(32));
    else {
      const bytes = await readFile(f.paths.archive);
      bytes[bytes.length - 2] ^= 1;
      await writeFile(f.paths.archive, bytes);
    }
    await assert.rejects(
      restoreResourceArchive(f.paths, f.entries, f.destination)
    );
    await assert.rejects(lstat(f.destination), { code: "ENOENT" });
    assert.ok(
      !(await readdir(f.root)).some((x) => x.startsWith(".asset-restore-"))
    );
  }
});

test("authenticated but invalid records fail atomically without path traversal or partial output", async (t) => {
  for (const failure of ["path", "missing", "digest", "duplicate"]) {
    const f = await fixture(t);
    await writeResourceArchive(f.paths, f.entries, async () => f.body);
    const manifest = JSON.parse(await readFile(f.paths.manifest, "utf8"));
    const row = {
      key: f.entries[0].key,
      bytes: f.body.length,
      sha256: createHash("sha256").update(f.body).digest("hex"),
      body: f.body.toString("base64")
    };
    const second = { ...row, key: f.entries[1].key };
    if (failure === "path") second.key = "../../escaped.webp";
    if (failure === "digest") second.sha256 = "0".repeat(64);
    if (failure === "duplicate") second.key = row.key;
    const lines = [
      { format: manifest.format, createdAt: manifest.createdAt },
      row,
      ...(failure === "missing" ? [] : [second])
    ];
    const cipher = createCipheriv(
      "aes-256-gcm",
      await readFile(f.paths.key),
      Buffer.from(manifest.iv, "hex")
    );
    const encrypted = Buffer.concat([
      cipher.update(lines.map((x) => JSON.stringify(x)).join("\n") + "\n"),
      cipher.final()
    ]);
    manifest.tag = cipher.getAuthTag().toString("hex");
    manifest.encryptedSha256 = createHash("sha256")
      .update(encrypted)
      .digest("hex");
    await writeFile(f.paths.archive, encrypted);
    await writeFile(f.paths.manifest, JSON.stringify(manifest));
    await assert.rejects(
      restoreResourceArchive(f.paths, f.entries, f.destination)
    );
    await assert.rejects(lstat(f.destination), { code: "ENOENT" });
    await assert.rejects(lstat(join(f.root, "escaped.webp")), {
      code: "ENOENT"
    });
    assert.ok(
      !(await readdir(f.root)).some((x) => x.startsWith(".asset-restore-"))
    );
  }
});

test("duplicate keys, over-budget entries and symbolic-link archives are rejected", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    writeResourceArchive(
      f.paths,
      [f.entries[0], f.entries[0]],
      async () => f.body
    )
  );
  await assert.rejects(
    writeResourceArchive(
      f.paths,
      [{ ...f.entries[0], bytes: 4 * 1024 * 1024 + 1 }],
      async () => f.body
    )
  );
  await writeResourceArchive(f.paths, f.entries, async () => f.body);
  const link = join(f.root, "archive-link");
  await symlink(f.paths.archive, link);
  await assert.rejects(
    restoreResourceArchive(
      { ...f.paths, archive: link },
      f.entries,
      f.destination
    )
  );
  await assert.rejects(lstat(f.destination), { code: "ENOENT" });
});
