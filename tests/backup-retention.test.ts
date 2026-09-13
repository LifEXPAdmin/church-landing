import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  copyFile,
  symlink,
  chmod
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import {
  expireBackups,
  inspectBackupRetention,
  BACKUP_EXPIRY_DAYS
} from "../lib/operations/backup-retention";
const DAY = 86400000,
  now = new Date("2026-09-13T12:00:00.000Z");
async function fixture(
  run: (options: {
    backupDirectory: string;
    keyDirectory: string;
    now: Date;
  }) => Promise<void>
) {
  const root = await mkdtemp(join(tmpdir(), "gc-backup-expiry-")),
    backupDirectory = join(root, "backups"),
    keyDirectory = join(root, "keys");
  await mkdir(backupDirectory, { mode: 0o700 });
  await mkdir(keyDirectory, { mode: 0o700 });
  try {
    await run({ backupDirectory, keyDirectory, now });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
async function backup(
  options: { backupDirectory: string; keyDirectory: string },
  created: Date,
  verified = true
) {
  const stamp = created.toISOString().replaceAll(":", "-"),
    keyFile = join(options.keyDirectory, stamp + ".key"),
    manifestFile = join(options.backupDirectory, stamp + ".json"),
    archive = join(options.backupDirectory, stamp + ".pgdump.aes256gcm");
  const key = randomBytes(32),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  const bytes = Buffer.concat([
    cipher.update("Fictional encrypted recovery fixture " + stamp),
    cipher.final()
  ]);
  const manifest = {
    createdAt: created.toISOString(),
    keyFile,
    cipher: "aes-256-gcm",
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    encryptedSha256: createHash("sha256").update(bytes).digest("hex"),
    rehearsal: verified ? "passed" : "pending",
    plaintextRestoreRemoved: verified
  };
  await writeFile(keyFile, key, { mode: 0o600 });
  await writeFile(archive, bytes, { mode: 0o600 });
  await writeFile(manifestFile, JSON.stringify(manifest), { mode: 0o600 });
  return { archive, manifestFile, keyFile, manifest };
}
test("inspection is read-only; the 28-day operating boundary preserves a verified current recovery copy", async () =>
  fixture(async (options) => {
    const old = await backup(
        options,
        new Date(now.getTime() - BACKUP_EXPIRY_DAYS * DAY)
      ),
      recent = await backup(options, new Date(now.getTime() - DAY));
    const before = await readdir(options.backupDirectory);
    const early = await inspectBackupRetention({
      ...options,
      now: new Date(now.getTime() - 1)
    });
    assert.equal(early.eligibleForExpiry, 0);
    const inspected = await inspectBackupRetention(options);
    assert.equal(inspected.eligibleForExpiry, 1);
    assert.equal(inspected.verifiedKeeper, basename(recent.manifestFile));
    assert.deepEqual(await readdir(options.backupDirectory), before);
    const result = await expireBackups(options);
    assert.equal(result.removed, 1);
    assert.equal(result.needsAttention, false);
    for (const p of [old.archive, old.keyFile, old.manifestFile])
      await assert.rejects(readFile(p), { code: "ENOENT" });
    assert.ok((await readFile(recent.archive)).length);
    assert.equal((await expireBackups(options)).removed, 0);
  }));
test("a sole expired or unverified recovery copy cannot authorize deletion", async () =>
  fixture(async (options) => {
    const only = await backup(options, new Date(now.getTime() - 31 * DAY));
    await assert.rejects(
      expireBackups(options),
      /verified current recovery copy/
    );
    assert.ok((await readFile(only.archive)).length);
    assert.ok((await readFile(only.keyFile)).length);
    await backup(options, new Date(now.getTime() - DAY), false);
    await assert.rejects(
      expireBackups(options),
      /verified current recovery copy/
    );
  }));
test("authenticated decryption and ciphertext checks detect the wrong key, checksum or incomplete data before deleting anything", async () =>
  fixture(async (options) => {
    const old = await backup(options, new Date(now.getTime() - 31 * DAY)),
      recent = await backup(options, new Date(now.getTime() - DAY));
    const original = await readFile(recent.keyFile);
    await writeFile(recent.keyFile, randomBytes(32));
    assert.ok(
      (await inspectBackupRetention(options)).issues.includes(
        "unverified-or-incomplete-backup"
      )
    );
    await assert.rejects(expireBackups(options));
    assert.ok((await readFile(old.archive)).length);
    await writeFile(recent.keyFile, original);
    await writeFile(old.archive, Buffer.from("corrupt fixture"));
    await assert.rejects(expireBackups(options), /incomplete or untracked/);
    assert.ok((await readFile(old.keyFile)).length);
  }));
test("copying a known archive with newer metadata cannot reset its original age or revive a retired copy", async () =>
  fixture(async (options) => {
    const original = await backup(options, new Date(now.getTime() - 20 * DAY));
    await expireBackups(options); // Remember the original authenticated archive age.
    const copiedName = new Date(now.getTime() - DAY)
      .toISOString()
      .replaceAll(":", "-");
    const copiedArchive = join(
        options.backupDirectory,
        copiedName + ".pgdump.aes256gcm"
      ),
      copiedManifest = join(options.backupDirectory, copiedName + ".json");
    await copyFile(original.archive, copiedArchive);
    await chmod(copiedArchive, 0o600);
    await writeFile(
      copiedManifest,
      JSON.stringify({
        ...original.manifest,
        createdAt: new Date(now.getTime() - DAY).toISOString()
      }),
      { mode: 0o600 }
    );
    const later = new Date(now.getTime() + 10 * DAY);
    await backup(options, new Date(later.getTime() - 1000));
    const plan = await inspectBackupRetention({ ...options, now: later });
    assert.equal(plan.eligibleForExpiry, 2);
    assert.equal((await expireBackups({ ...options, now: later })).removed, 2);
    await assert.rejects(readFile(copiedArchive), { code: "ENOENT" });
  }));
test("shared keys remain when a verified retained set still needs them", async () =>
  fixture(async (options) => {
    const original = await backup(options, new Date(now.getTime() - DAY));
    // Different ciphertext under the same key is a distinct recovery set; deleting
    // an old archive must not destroy another retained set's decryption key.
    const older = new Date(now.getTime() - 31 * DAY),
      stamp = older.toISOString().replaceAll(":", "-");
    const iv = randomBytes(12),
      cipher = createCipheriv(
        "aes-256-gcm",
        await readFile(original.keyFile),
        iv
      ),
      bytes = Buffer.concat([
        cipher.update("Earlier fictional snapshot"),
        cipher.final()
      ]);
    const path = join(options.backupDirectory, stamp + ".pgdump.aes256gcm");
    await writeFile(path, bytes, { mode: 0o600 });
    await writeFile(
      join(options.backupDirectory, stamp + ".json"),
      JSON.stringify({
        ...original.manifest,
        createdAt: older.toISOString(),
        iv: iv.toString("hex"),
        tag: cipher.getAuthTag().toString("hex"),
        encryptedSha256: createHash("sha256").update(bytes).digest("hex")
      }),
      { mode: 0o600 }
    );
    assert.equal((await expireBackups(options)).removed, 1);
    assert.ok((await readFile(original.keyFile)).length);
    assert.deepEqual((await inspectBackupRetention(options)).issues, []);
  }));
test("an interrupted unlink resumes from its immutable retirement record and cannot choose that archive as keeper", async () =>
  fixture(async (options) => {
    const old = await backup(options, new Date(now.getTime() - 31 * DAY));
    await backup(options, new Date(now.getTime() - DAY));
    await writeFile(
      join(options.backupDirectory, ".retention-index.json"),
      JSON.stringify({
        version: 1,
        records: {
          [old.manifest.encryptedSha256]: {
            createdAt: old.manifest.createdAt,
            retiredAt: new Date(now.getTime() - 1000).toISOString()
          }
        }
      }),
      { mode: 0o600 }
    );
    await rm(old.archive);
    assert.equal((await expireBackups(options)).removed, 1);
    await assert.rejects(readFile(old.keyFile), { code: "ENOENT" });
    assert.equal((await expireBackups(options)).removed, 0);
    const second = await backup(options, new Date(now.getTime() - 32 * DAY));
    const ledgerFile = join(options.backupDirectory, ".retention-index.json");
    const ledger = JSON.parse(await readFile(ledgerFile, "utf8"));
    ledger.records[second.manifest.encryptedSha256] = {
      createdAt: second.manifest.createdAt,
      retiredAt: now.toISOString()
    };
    await writeFile(ledgerFile, JSON.stringify(ledger));
    await rm(second.archive);
    await rm(second.keyFile);
    assert.equal((await expireBackups(options)).removed, 1);
    await assert.rejects(readFile(second.manifestFile), { code: "ENOENT" });
    assert.deepEqual((await inspectBackupRetention(options)).issues, []);
  }));
test("untracked files, symlinks, unsafe permissions and a held lock fail closed", async () =>
  fixture(async (options) => {
    const old = await backup(options, new Date(now.getTime() - 31 * DAY)),
      keeper = await backup(options, new Date(now.getTime() - DAY));
    await writeFile(
      join(options.backupDirectory, "untracked.dump"),
      "fixture",
      { mode: 0o600 }
    );
    await assert.rejects(expireBackups(options), /incomplete or untracked/);
    await rm(join(options.backupDirectory, "untracked.dump"));
    await chmod(keeper.keyFile, 0o644);
    await assert.rejects(expireBackups(options));
    await chmod(keeper.keyFile, 0o600);
    const held = join(options.backupDirectory, ".retention.lock");
    await writeFile(held, "fixture active lock", { mode: 0o600 });
    await assert.rejects(expireBackups(options), { code: "EEXIST" });
    await rm(held);
    const data = await readFile(keeper.keyFile);
    await rm(keeper.keyFile);
    await symlink(old.keyFile, keeper.keyFile);
    await assert.rejects(expireBackups(options));
    await rm(keeper.keyFile);
    await writeFile(keeper.keyFile, data, { mode: 0o600 });
    assert.equal((await expireBackups(options)).removed, 1);
  }));
