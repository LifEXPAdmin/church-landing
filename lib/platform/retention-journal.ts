import { get, put, del, list } from "@vercel/blob";
import type { PrismaClient } from "@prisma/client";
import {
  MESSAGING_RETENTION_POLICY,
  retentionDate,
  purgeMessagingCandidate,
  type DeletionJournal,
  type PurgeRecord
} from "./messaging-retention";

const PREFIX = "retention-v1/purge/";
export type JournalEntry = PurgeRecord & { completedAt: string | null };
export interface RetentionJournalStore<Entry = JournalEntry> {
  read(path: string): Promise<unknown | null>;
  write(path: string, entry: Entry): Promise<void>;
  remove(path: string): Promise<void>;
  page(cursor?: string): Promise<{ paths: string[]; cursor?: string }>;
}
const validDate = (value: unknown): value is string =>
  typeof value === "string" && new Date(value).toISOString() === value;
function validate(value: unknown): JournalEntry {
  const r = value as JournalEntry;
  if (
    !r ||
    typeof r !== "object" ||
    Array.isArray(r) ||
    Object.keys(r).sort().join() !==
      "completedAt,id,policy,recordedAt,target,version" ||
    !["MESSAGE", "REPORT"].includes(r.target) ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(r.id) ||
    !Number.isSafeInteger(r.version) ||
    r.version < 1 ||
    r.policy !== MESSAGING_RETENTION_POLICY ||
    !validDate(r.recordedAt) ||
    (r.completedAt !== null && !validDate(r.completedAt))
  )
    throw new Error("Invalid protected retention record");
  return r;
}
const pathFor = (record: PurgeRecord) =>
  `${PREFIX}${record.target.toLowerCase()}-${record.id}.json`;

export function privateRetentionStore<Entry = JournalEntry>(
  prefix = PREFIX
): RetentionJournalStore<Entry> {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID)
    throw new Error("Protected retention storage is not configured");
  return {
    async read(path) {
      const response = await get(path, {
        access: "private",
        useCache: false,
        abortSignal: AbortSignal.timeout(10000)
      });
      if (!response) return null;
      if (response.statusCode !== 200 || response.blob.size > 2048)
        throw new Error("Protected retention record is unavailable");
      return JSON.parse(await new Response(response.stream).text());
    },
    async write(path, entry) {
      await put(path, JSON.stringify(entry), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: "application/json",
        abortSignal: AbortSignal.timeout(10000)
      });
    },
    async remove(path) {
      await del(path, { abortSignal: AbortSignal.timeout(10000) });
    },
    async page(cursor) {
      const result = await list({
        prefix,
        limit: 100,
        cursor,
        abortSignal: AbortSignal.timeout(10000)
      });
      return {
        paths: result.blobs.map((b) => b.pathname),
        cursor: result.hasMore ? result.cursor : undefined
      };
    }
  };
}

// Blob is a private source separate from database backups. It contains only
// opaque deletion references; image paths and message payloads are never stored.
export function protectedDeletionJournal(
  store: RetentionJournalStore = privateRetentionStore()
) {
  const read = async (path: string) => {
    const value = await store.read(path);
    if (value === null) return null;
    const r = validate(value);
    if (
      pathFor(r) !== path &&
      pathFor(r).replace(".json", ".done.json") !== path
    )
      throw new Error("Protected retention key mismatch");
    return r;
  };
  const ensure = async (record: PurgeRecord) => {
    validate({ ...record, completedAt: null });
    const prior =
      (await read(pathFor(record).replace(".json", ".done.json"))) ??
      (await read(pathFor(record)));
    if (
      prior &&
      (prior.version !== record.version ||
        prior.recordedAt !== record.recordedAt)
    )
      throw new Error("Protected retention decision changed");
    return prior;
  };
  const writeOnce = async (path: string, entry: JournalEntry) => {
    try {
      await store.write(path, entry);
    } catch (error) {
      const prior = await read(path);
      if (
        !prior ||
        Object.keys(entry).some(
          (k) =>
            prior[k as keyof JournalEntry] !== entry[k as keyof JournalEntry]
        )
      )
        throw error;
    }
  };
  return {
    async record(record: PurgeRecord) {
      if (!(await ensure(record)))
        await writeOnce(pathFor(record), { ...record, completedAt: null });
    },
    async complete(record: PurgeRecord, completedAt: string) {
      if (!validDate(completedAt))
        throw new Error("Invalid purge completion time");
      const prior = await ensure(record);
      if (!prior)
        throw new Error("Purge decision was not protected before deletion");
      if (prior.completedAt && prior.completedAt !== completedAt)
        throw new Error("Purge completion time changed");
      if (!prior.completedAt)
        await writeOnce(pathFor(record).replace(".json", ".done.json"), {
          ...record,
          completedAt
        });
    },
    async page(cursor?: string) {
      const page = await store.page(cursor),
        entries: JournalEntry[] = [];
      for (const path of page.paths) {
        if (!path.startsWith(PREFIX))
          throw new Error("Unexpected protected retention path");
        const entry = await read(path);
        if (!entry)
          throw new Error(
            "Protected retention record disappeared during restoration"
          );
        const complete = await read(
          pathFor(entry).replace(".json", ".done.json")
        );
        if (
          !entries.some((e) => e.target === entry.target && e.id === entry.id)
        )
          entries.push(complete ?? entry);
      }
      return { entries, cursor: page.cursor };
    },
    async expire(record: PurgeRecord, now: Date) {
      const prior = await ensure(record);
      if (
        !prior?.completedAt ||
        retentionDate(new Date(prior.completedAt), 90) > now
      )
        return false;
      await store.remove(pathFor(record));
      await store.remove(pathFor(record).replace(".json", ".done.json"));
      return true;
    }
  } satisfies DeletionJournal & Record<string, unknown>;
}

// Maintenance-only: call on an isolated, traffic-disabled restore before any
// account session can be accepted. Even an interrupted deletion decision is
// authoritative: it was sealed before journaling, and cannot later be reopened.
export async function replayMessagingDeletions(
  db: PrismaClient,
  entries: JournalEntry[]
) {
  if (entries.length > 100) throw new Error("Replay bounded journal pages");
  entries.forEach(validate);
  await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      for (const entry of entries) {
        await purgeMessagingCandidate(tx, entry);
        await tx.retentionPurge.upsert({
          where: {
            target_targetId: { target: entry.target, targetId: entry.id }
          },
          create: {
            target: entry.target,
            targetId: entry.id,
            version: entry.version,
            policy: entry.policy,
            createdAt: new Date(entry.recordedAt),
            completedAt: entry.completedAt
              ? new Date(entry.completedAt)
              : new Date(),
            journaledAt: null
          },
          update: {}
        });
      }
    },
    { maxWait: 5000, timeout: 25000 }
  );
}
