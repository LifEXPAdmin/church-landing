import { createHash, createDecipheriv, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  readdir,
  readFile,
  rename,
  unlink,
  open
} from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
const DAY = 86400000;
// A one-day margin for a daily operator job; the policy is a maximum of 30 days.
export const BACKUP_EXPIRY_DAYS = 29;
type RecordEntry = { createdAt: string; retiredAt?: string };
type Ledger = { version: 1; records: Record<string, RecordEntry> };
type Manifest = {
  createdAt: string;
  cipher: string;
  iv: string;
  tag: string;
  encryptedSha256: string;
  keyFile: string;
  rehearsal?: string;
  plaintextRestoreRemoved?: boolean;
};
type SetEntry = {
  name: string;
  manifest: string;
  archive: string;
  key: string;
  hash: string;
  createdAt: string;
  verified: boolean;
  retired: boolean;
};
export type BackupOptions = {
  backupDirectory: string;
  keyDirectory: string;
  now?: Date;
};
const timestamp = (v: unknown): v is string =>
  typeof v === "string" &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
const manifestName = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z\.json$/;
async function regular(path: string, optional = false) {
  try {
    const stat = await lstat(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.mode & 0o077
    )
      throw Error("Backup files require private regular files with no links");
    return stat;
  } catch (error) {
    if (optional && (error as NodeJS.ErrnoException).code === "ENOENT")
      return null;
    throw error;
  }
}
async function privateDirectory(path: string) {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077)
    throw Error("Backup directories must be private and cannot be symlinks");
}
async function loadLedger(path: string): Promise<Ledger> {
  const stat = await regular(path, true);
  if (!stat) return { version: 1, records: {} };
  if (stat.size > 4 * 1024 * 1024)
    throw Error("Backup age ledger is too large");
  const value = JSON.parse(await readFile(path, "utf8")) as Ledger;
  if (
    value.version !== 1 ||
    !value.records ||
    typeof value.records !== "object" ||
    Array.isArray(value.records) ||
    Object.entries(value.records).some(
      ([hash, r]) =>
        !/^[a-f0-9]{64}$/.test(hash) ||
        !r ||
        !timestamp(r.createdAt) ||
        (r.retiredAt !== undefined && !timestamp(r.retiredAt))
    )
  )
    throw Error("Backup age ledger is invalid");
  return value;
}
async function verifiedArchive(path: string, key: string, manifest: Manifest) {
  const stat = await regular(path);
  if (!stat?.size) throw Error("Backup archive is empty");
  const keyStat = await regular(key);
  if (keyStat?.size !== 32) throw Error("Backup key is invalid");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    await readFile(key),
    Buffer.from(manifest.iv, "hex")
  );
  cipher.setAuthTag(Buffer.from(manifest.tag, "hex"));
  const hash = createHash("sha256");
  // Verify authentication and checksum with constant memory, without writing or
  // logging decrypted bytes. Restore attestation is still independently required.
  await pipeline(
    createReadStream(path),
    new Transform({
      transform(bytes, _encoding, next) {
        hash.update(bytes);
        next(null, bytes);
      }
    }),
    cipher,
    new Writable({
      write(_bytes, _encoding, next) {
        next();
      }
    })
  );
  if (hash.digest("hex") !== manifest.encryptedSha256)
    throw Error("Encrypted backup checksum does not match");
}
async function inspect(options: BackupOptions) {
  const directory = resolve(options.backupDirectory),
    keyDirectory = resolve(options.keyDirectory),
    now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime()) || directory === keyDirectory)
    throw Error(
      "Separate backup/key directories and a valid clock are required"
    );
  await privateDirectory(directory);
  await privateDirectory(keyDirectory);
  const ledgerPath = resolve(directory, ".retention-index.json"),
    ledger = await loadLedger(ledgerPath);
  const names = await readdir(directory);
  if (names.length > 2000)
    throw Error("Inspect the bounded backup inventory before continuing");
  const sets: SetEntry[] = [],
    issues: string[] = [];
  const known = new Set([".retention-index.json", ".retention.lock"]);
  for (const name of names.filter((n) => manifestName.test(n)).sort()) {
    const manifestPath = resolve(directory, name),
      archive = resolve(
        directory,
        name.replace(/\.json$/, ".pgdump.aes256gcm")
      );
    known.add(name);
    known.add(basename(archive));
    try {
      const stat = await regular(manifestPath);
      if (!stat || stat.size > 1024 * 1024) throw Error("Invalid manifest");
      const m = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
      if (
        !timestamp(m.createdAt) ||
        m.cipher !== "aes-256-gcm" ||
        !/^[a-f0-9]{24}$/.test(m.iv) ||
        !/^[a-f0-9]{32}$/.test(m.tag) ||
        !/^[a-f0-9]{64}$/.test(m.encryptedSha256) ||
        typeof m.keyFile !== "string"
      )
        throw Error("Invalid backup manifest");
      const key = resolve(m.keyFile);
      if (
        dirname(key) !== keyDirectory ||
        !/^[A-Za-z0-9_.-]+\.key$/.test(basename(key))
      )
        throw Error("Backup key lies outside the configured key directory");
      const namedAt = name
        .slice(0, -5)
        .replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3");
      if (!timestamp(namedAt)) throw Error("Invalid backup filename date");
      const prior = ledger.records[m.encryptedSha256];
      const createdAt = [
        m.createdAt,
        namedAt,
        ...(prior ? [prior.createdAt] : [])
      ].sort()[0];
      if (Date.parse(createdAt) > now.getTime())
        throw Error("Backup creation is in the future");
      // A prior retirement authorizes finishing an interrupted unlink sequence.
      // It never turns a retired copy into a recovery keeper.
      if (prior?.retiredAt) {
        if (await regular(archive, true)) {
          const checksum = createHash("sha256");
          for await (const bytes of createReadStream(archive))
            checksum.update(bytes);
          if (checksum.digest("hex") !== m.encryptedSha256)
            throw Error("Retired archive changed");
        }
        const remainingKey = await regular(key, true);
        if (remainingKey && remainingKey.size !== 32)
          throw Error("Retired backup key changed");
      } else await verifiedArchive(archive, key, m);
      sets.push({
        name,
        manifest: manifestPath,
        archive,
        key,
        hash: m.encryptedSha256,
        createdAt,
        verified:
          m.rehearsal === "passed" &&
          m.plaintextRestoreRemoved === true &&
          !prior?.retiredAt,
        retired: !!prior?.retiredAt
      });
      ledger.records[m.encryptedSha256] = { ...prior, createdAt };
    } catch {
      issues.push("unverified-or-incomplete-backup");
    }
  }
  for (const name of names)
    if (!known.has(name)) issues.push("untracked-backup-directory-file");
  const referenced = new Set(sets.map((s) => basename(s.key)));
  for (const key of await readdir(keyDirectory))
    if (!referenced.has(key)) issues.push("untracked-backup-key");
  for (const set of sets) set.createdAt = ledger.records[set.hash].createdAt;
  const candidates = sets.filter(
    (s) =>
      s.retired ||
      now.getTime() - Date.parse(s.createdAt) >= BACKUP_EXPIRY_DAYS * DAY
  );
  const keepers = sets
    .filter((s) => s.verified && !candidates.includes(s))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const s of sets)
    if (!s.verified && !s.retired) issues.push("restore-attestation-missing");
  return {
    directory,
    ledgerPath,
    ledger,
    now,
    sets,
    candidates,
    keeper: keepers[0],
    issues
  };
}
const projection = (state: Awaited<ReturnType<typeof inspect>>) => ({
  sets: state.sets.length,
  eligibleForExpiry: state.candidates.length,
  verifiedKeeper: state.keeper?.name ?? null,
  oldestCreatedAt: state.sets.map((s) => s.createdAt).sort()[0] ?? null,
  issues: [...new Set(state.issues)],
  expiryDays: BACKUP_EXPIRY_DAYS,
  maximumPolicyDays: 30
});
export async function inspectBackupRetention(options: BackupOptions) {
  return projection(await inspect(options));
}
export async function expireBackups(options: BackupOptions) {
  const directory = resolve(options.backupDirectory);
  await privateDirectory(directory);
  const lock = resolve(directory, ".retention.lock");
  const handle = await open(lock, "wx", 0o600);
  try {
    const state = await inspect(options);
    if (!state.keeper)
      throw Error(
        "A verified current recovery copy is required before backup expiry"
      );
    if (state.issues.some((issue) => issue !== "restore-attestation-missing"))
      throw Error("Resolve incomplete or untracked backup files before expiry");
    // Persist the original age before any deletion. Renaming or copying a known
    // archive with a newer filename/manifest cannot reset this registry's clock.
    for (const s of state.candidates)
      state.ledger.records[s.hash].retiredAt ??= state.now.toISOString();
    const present = new Set(state.sets.map((s) => s.hash));
    for (const [hash, r] of Object.entries(state.ledger.records))
      if (
        !present.has(hash) &&
        r.retiredAt &&
        state.now.getTime() - Date.parse(r.retiredAt) >= 90 * DAY
      )
        delete state.ledger.records[hash];
    const temp = resolve(directory, `.retention-${randomUUID()}.tmp`);
    try {
      const file = await open(temp, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify(state.ledger));
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temp, state.ledgerPath);
      const parent = await open(directory, "r");
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
    } finally {
      await unlink(temp).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
    const liveKeys = new Set(
      state.sets.filter((s) => !state.candidates.includes(s)).map((s) => s.key)
    );
    let removed = 0;
    for (const set of state.candidates) {
      // Keep the manifest until both archive and unreferenced key are removed,
      // so a crash at either step leaves a discoverable, authorized retry.
      for (const path of [
        set.archive,
        ...(!liveKeys.has(set.key) ? [set.key] : []),
        set.manifest
      ])
        await unlink(path).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
      removed++;
    }
    return {
      ...projection(state),
      removed,
      completedAt: state.now.toISOString(),
      needsAttention: state.issues.length > 0
    };
  } finally {
    await handle.close();
    await unlink(lock);
  }
}
