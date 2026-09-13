import { Prisma, type PrismaClient } from "@prisma/client";

export const MESSAGING_RETENTION_POLICY = "GC-MSG-RETENTION-v1";
export const DAY = 86_400_000;
export const retentionDate = (from: Date, days: number) =>
  new Date(from.getTime() + days * DAY);
type Tx = Prisma.TransactionClient;
export type MessagingPurgeCandidate = {
  target: "MESSAGE" | "REPORT";
  id: string;
  version: number;
};
export type PurgeRecord = MessagingPurgeCandidate & {
  policy: typeof MESSAGING_RETENTION_POLICY;
  recordedAt: string;
};
// The separately protected journal acknowledges an irrevocably sealed decision
// before erasure. If I/O fails, the sealed work remains pending and retryable.
export interface DeletionJournal {
  record(record: PurgeRecord): Promise<void>;
  complete(record: PurgeRecord, completedAt: string): Promise<void>;
}

// Called under the shared access/write lock by Clear for me and permanent
// closure. Deactivation and archive deliberately do not participate in this rule.
export async function markUnretainedMessages(
  tx: Tx,
  now: Date,
  conversationId?: string
) {
  return tx.$executeRaw(Prisma.sql`
    UPDATE "AdultMessage" m SET "unretainedAt" = ${now.toISOString()}::timestamp
    FROM "AdultConversation" c
    JOIN "PlatformUser" a ON a.id = c."participantAId"
    JOIN "PlatformUser" b ON b.id = c."participantBId"
    LEFT JOIN "AdultConversationState" sa ON sa."conversationId" = c.id AND sa."ownerId" = a.id
    LEFT JOIN "AdultConversationState" sb ON sb."conversationId" = c.id AND sb."ownerId" = b.id
    WHERE m."conversationId" = c.id AND m."unretainedAt" IS NULL
      AND (a."deletionRequestedAt" IS NOT NULL OR COALESCE(sa."hiddenThrough", 0) >= m.sequence)
      AND (b."deletionRequestedAt" IS NOT NULL OR COALESCE(sb."hiddenThrough", 0) >= m.sequence)
      ${conversationId ? Prisma.sql`AND c.id = ${conversationId}` : Prisma.empty}`);
}

async function candidatesIn(tx: Tx, now: Date) {
  const reports = await tx.$queryRaw<Array<{ id: string; version: number }>>`
    SELECT r.id, r.version FROM "CommunityReport" r
    WHERE r.status = 'CLOSED' AND r."closedAt" <= ${retentionDate(now, -180).toISOString()}::timestamp
      AND NOT EXISTS (SELECT 1 FROM "RetentionHold" h
        WHERE h.target = 'REPORT' AND h."targetId" = r.id AND h."releasedAt" IS NULL)
    ORDER BY r."closedAt", r.id LIMIT 100`;
  const messages = await tx.$queryRaw<Array<{ id: string; version: number }>>`
    SELECT m.id, m.sequence AS version FROM "AdultMessage" m
    JOIN "AdultConversation" c ON c.id = m."conversationId"
    JOIN "PlatformUser" a ON a.id = c."participantAId"
    JOIN "PlatformUser" b ON b.id = c."participantBId"
    LEFT JOIN "AdultConversationState" sa ON sa."conversationId" = c.id AND sa."ownerId" = a.id
    LEFT JOIN "AdultConversationState" sb ON sb."conversationId" = c.id AND sb."ownerId" = b.id
    WHERE m."unretainedAt" IS NOT NULL AND m."unretainedAt" <= ${now.toISOString()}::timestamp
      AND (a."deletionRequestedAt" IS NOT NULL OR COALESCE(sa."hiddenThrough", 0) >= m.sequence)
      AND (b."deletionRequestedAt" IS NOT NULL OR COALESCE(sb."hiddenThrough", 0) >= m.sequence)
      AND NOT EXISTS (SELECT 1 FROM "CommunityReport" r WHERE r."targetType" = 'MESSAGE' AND r."targetId" = m.id)
      AND NOT EXISTS (SELECT 1 FROM "RetentionHold" h WHERE h.target = 'MESSAGE' AND h."targetId" = m.id AND h."releasedAt" IS NULL)
    ORDER BY m."unretainedAt", m.id LIMIT 100`;
  return [
    ...reports.map((r) => ({ target: "REPORT" as const, ...r })),
    ...messages.map((m) => ({ target: "MESSAGE" as const, ...m }))
  ];
}

export async function inspectMessagingRetention(
  db: PrismaClient,
  now = new Date()
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock_shared(730221, 2)`;
    const pending = await tx.retentionPurge.findMany({
      where: { journaledAt: null },
      orderBy: [{ createdAt: "asc" }, { targetId: "asc" }],
      take: 100
    });
    const candidates = await candidatesIn(tx, now);
    return {
      policy: MESSAGING_RETENTION_POLICY,
      candidates: [
        ...pending.map((p) => ({
          target: p.target,
          id: p.targetId,
          version: p.version
        })),
        ...candidates.filter(
          (c) =>
            !pending.some((p) => p.target === c.target && p.targetId === c.id)
        )
      ].slice(0, 200),
      overdueReviews: await tx.communityReport.count({
        where: { status: { not: "CLOSED" }, reviewDueAt: { lte: now } }
      }),
      overdueHolds: await tx.retentionHold.count({
        where: { releasedAt: null, reviewDueAt: { lte: now } }
      })
    };
  });
}

// Receipts carry a body hash and safe result only. Replace identifiers of purged
// reports with a fixed unavailable receipt while retaining their retry key/hash:
// deleting an idempotency guard would let an old request recreate erased records.
async function retireReportReceipts(tx: Tx, id: string) {
  await tx.$executeRaw`
    UPDATE "SocialOperation" SET result = jsonb_build_object(
      'id', 'removed', 'version', 0, 'message', 'This report has expired under the retention policy.')
    WHERE key LIKE 'community-report:%' AND result->>'id' = ${id}`;
}

export async function purgeMessagingCandidate(
  tx: Tx,
  candidate: MessagingPurgeCandidate
) {
  if (candidate.target === "REPORT") {
    await tx.communityReportDecision.deleteMany({
      where: { reportId: candidate.id }
    });
    await retireReportReceipts(tx, candidate.id);
    await tx.communityReport.deleteMany({ where: { id: candidate.id } });
  } else {
    await tx.socialEvent.deleteMany({ where: { messageId: candidate.id } });
    await tx.adultMessage.deleteMany({ where: { id: candidate.id } });
  }
  await tx.retentionHold.deleteMany({
    where: {
      target: candidate.target,
      targetId: candidate.id,
      releasedAt: { not: null }
    }
  });
}

// Only candidates already inspected by the caller are considered. Recompute
// permission-independent retention state under the same gate as report/clear
// writes; a new report, hold or reopening cannot race the purge.
export async function runMessagingRetention(
  db: PrismaClient,
  inspected: MessagingPurgeCandidate[],
  journal: DeletionJournal,
  now = new Date()
) {
  if (inspected.length > 200)
    throw new Error("Inspect a bounded retention batch");
  const sealed = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      const current = await candidatesIn(tx, now);
      for (const candidate of current) {
        if (
          !inspected.some(
            (r) =>
              r.id === candidate.id &&
              r.target === candidate.target &&
              r.version === candidate.version
          )
        )
          continue;
        await tx.retentionPurge.upsert({
          where: {
            target_targetId: {
              target: candidate.target,
              targetId: candidate.id
            }
          },
          create: {
            target: candidate.target,
            targetId: candidate.id,
            version: candidate.version,
            policy: MESSAGING_RETENTION_POLICY,
            createdAt: now
          },
          update: {}
        });
      }
      return tx.retentionPurge.findMany({
        where: {
          OR: inspected.map((c) => ({
            target: c.target,
            targetId: c.id,
            version: c.version
          }))
        },
        take: 200
      });
    },
    { maxWait: 5000, timeout: 25000 }
  );
  let messages = 0,
    reports = 0;
  for (const seal of sealed) {
    const record: PurgeRecord = {
      target: seal.target,
      id: seal.targetId,
      version: seal.version,
      policy: MESSAGING_RETENTION_POLICY,
      recordedAt: seal.createdAt.toISOString()
    };
    await journal.record(record);
    const key = { target: seal.target, targetId: seal.targetId };
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      const current = await tx.retentionPurge.findUniqueOrThrow({
        where: { target_targetId: key }
      });
      if (current.completedAt)
        return { deleted: false, completedAt: current.completedAt };
      await purgeMessagingCandidate(tx, record);
      const completedAt = new Date();
      await tx.retentionPurge.update({
        where: { target_targetId: key },
        data: { completedAt }
      });
      return { deleted: true, completedAt };
    });
    if (result.deleted) {
      if (seal.target === "REPORT") reports++;
      else messages++;
    }
    await journal.complete(record, result.completedAt.toISOString());
    await db.retentionPurge.updateMany({
      where: { ...key, journaledAt: null },
      data: { journaledAt: new Date() }
    });
  }
  return { messages, reports };
}
