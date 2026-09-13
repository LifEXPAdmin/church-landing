import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  Prisma,
  type PrismaClient,
  type CommunityReport,
  type CommunityReportDecision,
  type RetentionHold
} from "@prisma/client";
import {
  privateRetentionStore,
  type RetentionJournalStore
} from "./retention-journal";
import {
  MESSAGING_RETENTION_POLICY as policy,
  retentionDate
} from "./messaging-retention";
type Tx = Prisma.TransactionClient;
const PREFIX = "retention-v1/controls/";
export type RetentionControlEntry = {
  id: string;
  kind:
    | "REPORT"
    | "HOLD"
    | "MODERATION_POST"
    | "MODERATION_COMMENT"
    | "APPEAL"
    | "AUTHOR_WITHDRAW_POST"
    | "AUTHOR_WITHDRAW_COMMENT";
  target: "REPORT" | "MESSAGE";
  targetId: string;
  sourceId: string;
  version: number;
  policy: typeof policy;
  outcome: string;
  operatorId: string | null;
  recordedAt: string;
  startedAt: string;
  reviewDueAt: string;
  endedAt: string | null;
};
export interface RetentionControlJournal {
  record(entry: RetentionControlEntry): Promise<void>;
}
const opaque = (v: unknown) =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v);
const date = (v: unknown) =>
  typeof v === "string" &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
function validate(value: unknown): RetentionControlEntry {
  const r = value as RetentionControlEntry;
  if (
    !r ||
    typeof r !== "object" ||
    Array.isArray(r) ||
    Object.keys(r).sort().join() !==
      "endedAt,id,kind,operatorId,outcome,policy,recordedAt,reviewDueAt,sourceId,startedAt,target,targetId,version" ||
    ![r.id, r.targetId, r.sourceId].every(opaque) ||
    (r.operatorId !== null && !opaque(r.operatorId)) ||
    !Number.isSafeInteger(r.version) ||
    r.version < 1 ||
    r.policy !== policy ||
    ![r.recordedAt, r.startedAt, r.reviewDueAt].every(date) ||
    (r.endedAt !== null && !date(r.endedAt)) ||
    !(r.kind === "REPORT"
      ? r.target === "REPORT" &&
        r.sourceId === r.targetId &&
        ["RECEIVED", "FOLLOW_UP_REQUIRED", "CLOSED"].includes(r.outcome)
      : r.kind === "MODERATION_POST" || r.kind === "MODERATION_COMMENT"
        ? r.target === "REPORT" &&
          ["VISIBLE", "HIDDEN", "REMOVED"].includes(r.outcome)
        : r.kind === "AUTHOR_WITHDRAW_POST" ||
            r.kind === "AUTHOR_WITHDRAW_COMMENT"
          ? r.target === "REPORT" &&
            r.outcome === "WITHDRAWN" &&
            r.endedAt === null
          : r.kind === "APPEAL"
            ? r.target === "REPORT" &&
              [
                "RECEIVED",
                "IN_PROGRESS",
                "WAITING_FOR_REQUESTER",
                "RESOLVED",
                "CLOSED"
              ].includes(r.outcome)
            : r.kind === "HOLD" &&
              ["REPORT", "MESSAGE"].includes(r.target) &&
              ["PRESERVE", "REVIEW", "RELEASE"].includes(r.outcome)) ||
    ["CLOSED", "RESOLVED", "RELEASE"].includes(r.outcome) !==
      (r.endedAt !== null)
  )
    throw Error("Invalid protected retention control");
  return r;
}
async function record(tx: Tx, entry: RetentionControlEntry) {
  validate(entry);
  await tx.retentionControl.upsert({
    where: {
      kind_sourceId_version: {
        kind: entry.kind,
        sourceId: entry.sourceId,
        version: entry.version
      }
    },
    create: {
      id: entry.id,
      target: entry.target,
      targetId: entry.targetId,
      sourceId: entry.sourceId,
      kind: entry.kind,
      version: entry.version,
      payload: entry,
      createdAt: new Date(entry.recordedAt)
    },
    update: {}
  });
}
export function recordReportControl(
  tx: Tx,
  report: CommunityReport,
  operatorId: string | null
) {
  return record(tx, {
    id: randomUUID(),
    kind: "REPORT",
    target: "REPORT",
    targetId: report.id,
    sourceId: report.id,
    version: report.version,
    policy,
    outcome: report.status,
    operatorId,
    recordedAt: report.updatedAt.toISOString(),
    startedAt: report.createdAt.toISOString(),
    reviewDueAt: report.reviewDueAt.toISOString(),
    endedAt: report.closedAt?.toISOString() ?? null
  });
}
export function recordHoldControl(
  tx: Tx,
  hold: RetentionHold,
  outcome: "PRESERVE" | "REVIEW" | "RELEASE"
) {
  return record(tx, {
    id: randomUUID(),
    kind: "HOLD",
    target: hold.target,
    targetId: hold.targetId,
    sourceId: hold.id,
    version: hold.version,
    policy,
    outcome,
    operatorId: hold.operatorId,
    recordedAt: new Date().toISOString(),
    startedAt: hold.createdAt.toISOString(),
    reviewDueAt: hold.reviewDueAt.toISOString(),
    endedAt: hold.releasedAt?.toISOString() ?? null
  });
}
// The separately protected journal contains only the selected source reference,
// resulting restriction and version. It never copies content or author reasons.
export function recordContentControl(
  tx: Tx,
  report: CommunityReport,
  decision: CommunityReportDecision
) {
  if (decision.fromVisibility === decision.toVisibility) return;
  return record(tx, {
    id: randomUUID(),
    kind:
      report.targetType === "POST" ? "MODERATION_POST" : "MODERATION_COMMENT",
    target: "REPORT",
    targetId: report.id,
    sourceId: report.targetId,
    version: decision.sourceVersion!,
    policy,
    outcome: decision.toVisibility!,
    operatorId: decision.actorId,
    recordedAt: decision.createdAt.toISOString(),
    startedAt: decision.createdAt.toISOString(),
    reviewDueAt: report.reviewDueAt.toISOString(),
    endedAt: null
  });
}
export async function recordAppealControl(
  tx: Tx,
  caseId: string,
  actorId: string
) {
  const row = await tx.supportCase.findUniqueOrThrow({
    where: { id: caseId },
    select: {
      id: true,
      version: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      moderationDecision: {
        select: { reportId: true, report: { select: { reviewDueAt: true } } }
      }
    }
  });
  if (!row.moderationDecision) return;
  return record(tx, {
    id: randomUUID(),
    kind: "APPEAL",
    target: "REPORT",
    targetId: row.moderationDecision.reportId,
    sourceId: row.id,
    version: row.version,
    policy,
    outcome: row.status,
    operatorId: actorId,
    recordedAt: row.updatedAt.toISOString(),
    startedAt: row.createdAt.toISOString(),
    reviewDueAt: row.moderationDecision.report.reviewDueAt.toISOString(),
    endedAt: ["RESOLVED", "CLOSED"].includes(row.status)
      ? row.updatedAt.toISOString()
      : null
  });
}
export async function selectedSourceReport(
  tx: Tx,
  type: "POST" | "COMMENT",
  id: string
) {
  return tx.communityReport.findFirst({
    where: { targetType: type, targetId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, targetType: true, targetId: true, reviewDueAt: true }
  });
}
export function recordReportedWithdrawal(
  tx: Tx,
  report: Pick<
    CommunityReport,
    "id" | "targetType" | "targetId" | "reviewDueAt"
  >,
  actorId: string,
  version: number,
  now: Date
) {
  return record(tx, {
    id: randomUUID(),
    kind:
      report.targetType === "POST"
        ? "AUTHOR_WITHDRAW_POST"
        : "AUTHOR_WITHDRAW_COMMENT",
    target: "REPORT",
    targetId: report.id,
    sourceId: report.targetId,
    version,
    policy,
    outcome: "WITHDRAWN",
    operatorId: actorId,
    recordedAt: now.toISOString(),
    startedAt: now.toISOString(),
    reviewDueAt: report.reviewDueAt.toISOString(),
    endedAt: null
  });
}
export function protectedRetentionControls(
  store: RetentionJournalStore<RetentionControlEntry> = privateRetentionStore(
    PREFIX
  )
) {
  const path = (id: string) => `${PREFIX}${id}.json`;
  async function read(key: string) {
    const raw = await store.read(key);
    if (raw === null) return null;
    const entry = validate(raw);
    if (key !== path(entry.id)) throw Error("Protected control key mismatch");
    return entry;
  }
  return {
    async record(entry: RetentionControlEntry) {
      validate(entry);
      const key = path(entry.id),
        old = await read(key);
      if (old) {
        if (!isDeepStrictEqual(old, entry))
          throw Error("Protected control decision changed");
        return;
      }
      try {
        await store.write(key, entry);
      } catch (error) {
        if (!isDeepStrictEqual(await read(key), entry)) throw error;
      }
    },
    async page(cursor?: string) {
      const page = await store.page(cursor),
        entries: RetentionControlEntry[] = [];
      for (const key of page.paths) {
        if (!key.startsWith(PREFIX))
          throw Error("Unexpected protected control path");
        const entry = await read(key);
        if (!entry)
          throw Error("Protected control disappeared during restoration");
        entries.push(entry);
      }
      return { entries, cursor: page.cursor };
    },
    async expire(entry: RetentionControlEntry, completedAt: Date, now: Date) {
      validate(entry);
      if (
        !Number.isFinite(completedAt.getTime()) ||
        !Number.isFinite(now.getTime())
      )
        throw Error("Valid purge completion and expiry times are required");
      if (retentionDate(completedAt, 90) > now) return false;
      await store.remove(path(entry.id));
      return true;
    }
  } satisfies RetentionControlJournal & Record<string, unknown>;
}
// Scoped publication is outside the permission transaction. The durable row
// remains pending on failure; the reviewer retries the same canonical command.
export async function journalRetentionControls(
  db: PrismaClient,
  journal: RetentionControlJournal,
  targetId?: string | string[],
  signal?: AbortSignal
) {
  const scope = targetId
    ? { targetId: Array.isArray(targetId) ? { in: targetId } : targetId }
    : {};
  const rows = await db.retentionControl.findMany({
    where: { journaledAt: null, ...scope },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 100
  });
  let recorded = 0,
    failed = 0;
  for (let start = 0; start < rows.length && !signal?.aborted; start += 8) {
    const results = await Promise.allSettled(
      rows.slice(start, start + 8).map(async (row) => {
        await journal.record(validate(row.payload));
        await db.retentionControl.updateMany({
          where: { id: row.id, journaledAt: null },
          data: { journaledAt: new Date() }
        });
      })
    );
    for (const result of results) {
      if (result.status === "fulfilled") recorded++;
      else failed++;
    }
  }
  return {
    recorded,
    failed,
    pending: await db.retentionControl.count({
      where: { journaledAt: null, ...scope }
    })
  };
}
// Withdrawal already committed before this provider call. Do not turn a saved
// deletion into an apparent failed edit: maintenance retries durable pending
// controls, and the response explicitly distinguishes pending recovery protection.
export async function protectReportedWithdrawal(
  db: PrismaClient,
  type: "POST" | "COMMENT",
  sourceId: string,
  journal?: RetentionControlJournal
) {
  try {
    const entry = await db.retentionControl.findFirst({
      where: {
        kind:
          type === "POST" ? "AUTHOR_WITHDRAW_POST" : "AUTHOR_WITHDRAW_COMMENT",
        sourceId,
        journaledAt: null
      },
      select: { targetId: true }
    });
    if (!entry) return true;
    const result = await journalRetentionControls(
      db,
      journal ?? protectedRetentionControls(),
      entry.targetId
    );
    return !result.failed && !result.pending;
  } catch {
    return false;
  }
}
const RESTORED_REASON =
  "Protected preservation restored; the original case reason requires authorized review.";
// Replay before purge/account receipts. Newer source versions win regardless of
// object-store page order. Missing cases are a recovery discrepancy, never a
// reason to silently drop a hold or invent the lost report's free-form evidence.
export async function replayRetentionControls(
  db: PrismaClient,
  entries: RetentionControlEntry[]
) {
  if (entries.length > 100) throw Error("Replay bounded control pages");
  entries.forEach(validate);
  const missingReports = new Set<string>();
  await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      for (const entry of entries) {
        if (
          entry.kind === "AUTHOR_WITHDRAW_POST" ||
          entry.kind === "AUTHOR_WITHDRAW_COMMENT"
        ) {
          // Source withdrawal has no reversal operation. Preserve it even when
          // a later moderation version is replayed first, without republishing.
          if (entry.kind === "AUTHOR_WITHDRAW_POST")
            await tx.$executeRaw`UPDATE "PlatformPost" SET status='WITHDRAWN', "withdrawnAt"=coalesce("withdrawnAt",${entry.recordedAt}::timestamp), "discussionClosed"=true, version=greatest(version,${entry.version}) WHERE id=${entry.sourceId}`;
          else
            await tx.$executeRaw`UPDATE "PlatformPostComment" SET "deletedAt"=coalesce("deletedAt",${entry.recordedAt}::timestamp), version=greatest(version,${entry.version}) WHERE id=${entry.sourceId}`;
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (entry.kind === "APPEAL") {
          // This records the latest version that must exist. An older case or
          // missing reply cannot be fabricated from a content-free journal.
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (
          entry.kind === "MODERATION_POST" ||
          entry.kind === "MODERATION_COMMENT"
        ) {
          // An old backup cannot prove the text, audience and attachments that
          // were approved when a restriction was lifted. Keep that source hidden
          // for explicit reinspection; never reconstruct or republish old text.
          const visibility =
            entry.outcome === "VISIBLE"
              ? "HIDDEN"
              : (entry.outcome as "HIDDEN" | "REMOVED");
          const table =
            entry.kind === "MODERATION_POST"
              ? Prisma.sql`"PlatformPost"`
              : Prisma.sql`"PlatformPostComment"`;
          await tx.$executeRaw(Prisma.sql`UPDATE ${table} SET "moderationState"=${visibility}::"ContentModerationState", version=${entry.version}
            WHERE id=${entry.sourceId} AND (version < ${entry.version} OR (version=${entry.version} AND ${entry.outcome !== "VISIBLE"}))`);
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        const sealed = await tx.retentionPurge.findUnique({
          where: {
            target_targetId: { target: entry.target, targetId: entry.targetId }
          }
        });
        if (sealed) continue;
        if (entry.kind === "REPORT") {
          const report = await tx.communityReport.findUnique({
            where: { id: entry.targetId }
          });
          if (!report) {
            missingReports.add(entry.targetId);
            continue;
          }
          if (report.version < entry.version)
            await tx.communityReport.update({
              where: { id: report.id },
              data: {
                status: entry.outcome as CommunityReport["status"],
                version: entry.version,
                closedAt: entry.endedAt ? new Date(entry.endedAt) : null,
                reviewDueAt: new Date(entry.reviewDueAt)
              }
            });
        } else {
          const targetExists =
            entry.target === "REPORT"
              ? await tx.communityReport.count({
                  where: { id: entry.targetId }
                })
              : await tx.adultMessage.count({ where: { id: entry.targetId } });
          if (!targetExists) {
            if (entry.target === "REPORT") missingReports.add(entry.targetId);
            continue;
          }
          const hold = await tx.retentionHold.findUnique({
            where: { id: entry.sourceId }
          });
          if (!hold || hold.version < entry.version) {
            const data = {
              target: entry.target,
              targetId: entry.targetId,
              version: entry.version,
              operatorId: entry.operatorId ?? "restoration",
              reviewDueAt: new Date(entry.reviewDueAt),
              releasedAt: entry.endedAt ? new Date(entry.endedAt) : null
            };
            await tx.retentionHold.upsert({
              where: { id: entry.sourceId },
              create: {
                id: entry.sourceId,
                ...data,
                reason: RESTORED_REASON,
                createdAt: new Date(entry.startedAt)
              },
              update: data
            });
            await tx.retentionHoldEvent.upsert({
              where: { id: entry.id },
              create: {
                id: entry.id,
                holdId: entry.sourceId,
                operatorId: data.operatorId,
                action: entry.outcome,
                version: entry.version,
                createdAt: new Date(entry.recordedAt),
                reason: RESTORED_REASON
              },
              update: {}
            });
          }
        }
        await record(tx, entry);
        await tx.retentionControl.updateMany({
          where: { id: entry.id, journaledAt: null },
          data: { journaledAt: new Date() }
        });
      }
    },
    { maxWait: 10000, timeout: 30000 }
  );
  return { missingReports: [...missingReports] };
}
export async function inspectRestoredHolds(db: PrismaClient) {
  return db.retentionHold.count({
    where: { reason: RESTORED_REASON, releasedAt: null }
  });
}
export async function inspectRestoredModeration(db: PrismaClient) {
  const [row] = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    WITH latest AS (SELECT DISTINCT ON (kind, "sourceId") kind, "sourceId", version, payload FROM "RetentionControl" WHERE kind IN ('MODERATION_POST','MODERATION_COMMENT') ORDER BY kind, "sourceId", version DESC)
    SELECT count(*)::bigint AS count FROM latest r
    LEFT JOIN "PlatformPost" p ON r.kind='MODERATION_POST' AND p.id=r."sourceId"
    LEFT JOIN "PlatformPostComment" c ON r.kind='MODERATION_COMMENT' AND c.id=r."sourceId"
    WHERE r.payload->>'outcome'='VISIBLE' AND
      (p.version <= r.version AND p."moderationState" <> 'VISIBLE' OR c.version <= r.version AND c."moderationState" <> 'VISIBLE')`);
  return Number(row.count);
}
export async function inspectRestoredAppeals(db: PrismaClient) {
  const [row] = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    WITH latest AS (SELECT DISTINCT ON ("sourceId") "sourceId", "targetId", version FROM "RetentionControl" WHERE kind='APPEAL' ORDER BY "sourceId", version DESC)
    SELECT count(*)::bigint AS count FROM latest r LEFT JOIN "SupportCase" s ON s.id=r."sourceId"
    WHERE (s.id IS NULL OR s.version < r.version) AND NOT EXISTS (SELECT 1 FROM "RetentionPurge" purge WHERE purge.target='REPORT' AND purge."targetId"=r."targetId")`);
  return Number(row.count);
}
