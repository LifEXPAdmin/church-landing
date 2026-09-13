import { isDeepStrictEqual } from "node:util";
import type { PrismaClient } from "@prisma/client";
import { createSessionToken, hashSessionToken } from "./auth";
import { closeVerifiedAccountAccess } from "./account-lifecycle";
import {
  type AccountDeletionRecord,
  type AccountDeletionJournal
} from "./account-deletion";
import {
  MESSAGING_RETENTION_POLICY,
  retentionDate
} from "./messaging-retention";
import {
  privateRetentionStore,
  type RetentionJournalStore
} from "./retention-journal";

const PREFIX = "retention-v1/accounts/";
export type AccountJournalEntry = AccountDeletionRecord & {
  completedAt: string | null;
};
const timestamp = (v: unknown): v is string =>
  typeof v === "string" &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
function validate(value: unknown): AccountJournalEntry {
  const r = value as AccountJournalEntry;
  if (
    !r ||
    typeof r !== "object" ||
    Array.isArray(r) ||
    Object.keys(r).sort().join() !==
      "completedAt,id,policy,requestedAt,userId" ||
    ![r.id, r.userId].every(
      (id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(id)
    ) ||
    r.policy !== MESSAGING_RETENTION_POLICY ||
    !timestamp(r.requestedAt) ||
    (r.completedAt !== null &&
      (!timestamp(r.completedAt) || r.completedAt < r.requestedAt))
  )
    throw Error("Invalid protected account deletion record");
  return r;
}
const pathFor = (r: AccountDeletionRecord, complete = false) =>
  `${PREFIX}${r.id}${complete ? ".done" : ""}.json`;

export function protectedAccountDeletionJournal(
  store: RetentionJournalStore<AccountJournalEntry> = privateRetentionStore(
    PREFIX
  )
) {
  const read = async (path: string) => {
    const value = await store.read(path);
    if (value === null) return null;
    const r = validate(value);
    if (path !== pathFor(r, r.completedAt !== null))
      throw Error("Protected account key mismatch");
    return r;
  };
  const writeOnce = async (entry: AccountJournalEntry) => {
    validate(entry);
    const path = pathFor(entry, entry.completedAt !== null);
    const prior = await read(path);
    if (prior) {
      if (!isDeepStrictEqual(prior, entry))
        throw Error("Protected account decision changed");
      return;
    }
    try {
      await store.write(path, entry);
    } catch (error) {
      if (!isDeepStrictEqual(await read(path), entry)) throw error;
    }
  };
  return {
    recordAccount: (record: AccountDeletionRecord) =>
      writeOnce({ ...record, completedAt: null }),
    async completeAccount(record: AccountDeletionRecord, completedAt: string) {
      const prior = await read(pathFor(record));
      if (!isDeepStrictEqual(prior, { ...record, completedAt: null }))
        throw Error("Account request was not protected before erasure");
      await writeOnce({ ...record, completedAt });
    },
    async page(cursor?: string) {
      const page = await store.page(cursor),
        entries: AccountJournalEntry[] = [];
      for (const path of page.paths) {
        if (!path.startsWith(PREFIX))
          throw Error("Unexpected protected account path");
        const entry = await read(path);
        if (!entry)
          throw Error(
            "Protected account record disappeared during restoration"
          );
        if (!entries.some((r) => r.id === entry.id))
          entries.push((await read(pathFor(entry, true))) ?? entry);
      }
      return { entries, cursor: page.cursor };
    },
    async expire(record: AccountDeletionRecord, now: Date) {
      const prior = await read(pathFor(record, true));
      if (
        !prior?.completedAt ||
        retentionDate(new Date(prior.completedAt), 90) > now
      )
        return false;
      await store.remove(pathFor(record));
      await store.remove(pathFor(record, true));
      return true;
    }
  } satisfies AccountDeletionJournal & Record<string, unknown>;
}

// Run before reopening a restored database. The separate journal is authoritative
// even when the chosen backup predates the request. It holds no sign-in or progress
// credential: a restored request receives an unguessable, undisclosed replacement.
export async function replayAccountDeletions(
  db: PrismaClient,
  entries: AccountJournalEntry[],
  journal: AccountDeletionJournal
) {
  const { eraseRequestedAccountData } = await import("./account-erasure");
  if (entries.length > 100) throw Error("Replay bounded account journal pages");
  entries.forEach(validate);
  let replayed = 0;
  for (const entry of entries) {
    const exists = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
        const user = await tx.platformUser.findUnique({
          where: { id: entry.userId }
        });
        if (!user) return false;
        const requestedAt = new Date(entry.requestedAt);
        const prior = await tx.accountDeletion.findUnique({
          where: { userId: entry.userId }
        });
        if (
          prior &&
          (prior.id !== entry.id ||
            prior.requestedAt.getTime() !== requestedAt.getTime() ||
            (prior.completedAt &&
              entry.completedAt &&
              prior.completedAt.toISOString() !== entry.completedAt))
        )
          throw Error(
            "Restored account deletion does not match protected request"
          );
        await closeVerifiedAccountAccess(tx, entry.userId, requestedAt, true);
        await tx.accountDeletion.upsert({
          where: { userId: entry.userId },
          create: {
            id: entry.id,
            userId: entry.userId,
            requestedAt,
            dueAt: retentionDate(requestedAt, 30),
            policy: entry.policy,
            proofHash: hashSessionToken(createSessionToken()),
            completedAt: entry.completedAt ? new Date(entry.completedAt) : null
          },
          update: entry.completedAt
            ? { completedAt: new Date(entry.completedAt) }
            : {}
        });
        return true;
      },
      { maxWait: 10000, timeout: 30000 }
    );
    if (exists) {
      await eraseRequestedAccountData(db, entry.id, journal);
      replayed++;
    }
  }
  return { replayed };
}
