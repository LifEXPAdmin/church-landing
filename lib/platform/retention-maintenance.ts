import { expireFeedSnapshots } from "./feed-snapshot-retention";
import { purgeExpiredMeasurements } from "./platform-measurement";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  maintenanceRequestError,
  maintenanceHeaders as headers
} from "./maintenance-request";
import {
  inspectMessagingRetention,
  runMessagingRetention,
  retentionDate,
  type PurgeRecord
} from "./messaging-retention";
import { protectedDeletionJournal } from "./retention-journal";
import { protectedAccountDeletionJournal } from "./account-deletion-journal";
import { accountDeletionRecord } from "./account-deletion";
import {
  eraseRequestedAccountData,
  finalizeAccountDeletion
} from "./account-erasure";
import {
  recordHoldControl,
  recordReportControl,
  journalRetentionControls,
  protectedRetentionControls,
  type RetentionControlEntry
} from "./retention-controls";
export const retentionJournals = () => ({
  messages: protectedDeletionJournal(),
  accounts: protectedAccountDeletionJournal(),
  controls: protectedRetentionControls()
});
export type RetentionJournals = ReturnType<typeof retentionJournals>;

// Seed only missing current control versions, for a pre-policy database. Existing
// controls and historical clocks are unchanged; no message/account is erased here.
export async function prepareRetentionControls(db: PrismaClient) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      const reports = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT r.id FROM "CommunityReport" r
      WHERE NOT EXISTS (SELECT 1 FROM "RetentionControl" c WHERE c.kind = 'REPORT' AND c."sourceId" = r.id AND c.version = r.version)
      ORDER BY r.id LIMIT 100`;
      const holds = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT h.id FROM "RetentionHold" h
      WHERE NOT EXISTS (SELECT 1 FROM "RetentionControl" c WHERE c.kind = 'HOLD' AND c."sourceId" = h.id AND c.version = h.version)
      ORDER BY h.id LIMIT 100`;
      for (const report of await tx.communityReport.findMany({
        where: { id: { in: reports.map((r) => r.id) } }
      }))
        await recordReportControl(tx, report, null);
      for (const hold of await tx.retentionHold.findMany({
        where: { id: { in: holds.map((r) => r.id) } }
      }))
        await recordHoldControl(
          tx,
          hold,
          hold.releasedAt ? "RELEASE" : hold.version > 1 ? "REVIEW" : "PRESERVE"
        );
      return { reports: reports.length, holds: holds.length };
    },
    { maxWait: 10000, timeout: 30000 }
  );
}
export async function inspectRetentionOperations(
  db: PrismaClient,
  now = new Date()
) {
  const messaging = await inspectMessagingRetention(db, now);
  const accountWhere = {
    OR: [{ completedAt: null }, { completionJournaledAt: null }]
  };
  const accounts = await db.accountDeletion.findMany({
    where: accountWhere,
    select: {
      id: true,
      requestedAt: true,
      dueAt: true,
      structuredPurgedAt: true,
      exceptions: true
    },
    orderBy: [
      { lastAttemptAt: { sort: "asc", nulls: "first" } },
      { dueAt: "asc" },
      { id: "asc" }
    ],
    take: 10
  });
  return {
    ...messaging,
    accounts,
    pendingAccounts: await db.accountDeletion.count({ where: accountWhere }),
    overdueAccounts: await db.accountDeletion.count({
      where: { ...accountWhere, dueAt: { lte: now } }
    }),
    pendingProtectedControls: await db.retentionControl.count({
      where: { journaledAt: null }
    })
  };
}
// Expire protected entries before dropping their local completion receipts. An
// interrupted remove is idempotent; the original purge completion is never reset.
export async function expireRetentionReceipts(
  db: PrismaClient,
  journals: RetentionJournals,
  now = new Date(),
  signal?: AbortSignal
) {
  let controls = 0,
    messages = 0,
    accounts = 0;
  const cutoff = retentionDate(now, -90);
  const oldControls = await db.$queryRaw<
    Array<{ id: string; payload: Prisma.JsonValue; completedAt: Date }>
  >`
    SELECT * FROM (SELECT c.id, c.payload, p."completedAt" FROM "RetentionControl" c
    JOIN "RetentionPurge" p ON p.target = c.target AND p."targetId" = c."targetId"
    WHERE p."completedAt" <= ${cutoff.toISOString()}::timestamp AND p."journaledAt" IS NOT NULL
    UNION ALL
    SELECT c.id, c.payload, d."completedAt" FROM "RetentionControl" c
    JOIN "AccountDeletion" d ON c.target='ACCOUNT' AND d."userId"=c."targetId"
    WHERE d."completedAt" <= ${cutoff.toISOString()}::timestamp AND d."completionJournaledAt" IS NOT NULL
    ) expired ORDER BY "completedAt", id LIMIT 100`;
  for (const row of oldControls) {
    if (signal?.aborted) return { controls, messages, accounts };
    if (
      await journals.controls.expire(
        row.payload as RetentionControlEntry,
        row.completedAt,
        now
      )
    ) {
      await db.retentionControl.deleteMany({ where: { id: row.id } });
      controls++;
    }
  }
  const oldMessages = await db.retentionPurge.findMany({
    where: { completedAt: { lte: cutoff }, journaledAt: { not: null } },
    take: 100,
    orderBy: [{ completedAt: "asc" }, { targetId: "asc" }]
  });
  for (const row of oldMessages) {
    if (signal?.aborted) return { controls, messages, accounts };
    if (
      await db.retentionControl.count({
        where: { target: row.target, targetId: row.targetId }
      })
    )
      continue;
    if (row.target !== "REPORT" && row.target !== "MESSAGE") continue; // Other targets have dedicated lifecycle owners.
    const record: PurgeRecord = {
      target: row.target,
      id: row.targetId,
      version: row.version,
      policy: row.policy as PurgeRecord["policy"],
      recordedAt: row.createdAt.toISOString()
    };
    if (await journals.messages.expire(record, now)) {
      await db.retentionPurge.deleteMany({
        where: {
          target: row.target,
          targetId: row.targetId,
          completedAt: row.completedAt,
          journaledAt: { not: null }
        }
      });
      messages++;
    }
  }
  const oldAccounts = await db.accountDeletion.findMany({
    where: {
      completedAt: { lte: cutoff },
      completionJournaledAt: { not: null }
    },
    take: 100,
    orderBy: [{ completedAt: "asc" }, { id: "asc" }]
  });
  for (const row of oldAccounts) {
    if (signal?.aborted) return { controls, messages, accounts };
    if (
      await db.retentionControl.count({
        where: { target: "ACCOUNT", targetId: row.userId }
      })
    )
      continue;
    if (await journals.accounts.expire(accountDeletionRecord(row), now)) {
      await db.accountDeletion.deleteMany({
        where: {
          id: row.id,
          completedAt: row.completedAt,
          completionJournaledAt: { not: null }
        }
      });
      accounts++;
    }
  }
  return { controls, messages, accounts };
}
export async function runRetentionOperations(
  db: PrismaClient,
  journals: RetentionJournals,
  signal = AbortSignal.timeout(40000)
) {
  const feedSnapshotsExpired = await expireFeedSnapshots(db);
  let measurementsExpired = { days: 0, choices: 0, trimmedDays: 0 }, measurementFailure = 0;
  try {
    measurementsExpired = await db.$transaction((tx) => purgeExpiredMeasurements(tx));
  } catch {
    // Optional measurement maintenance must not stop account or message erasure.
    measurementFailure = 1;
  }
  const seeded = await prepareRetentionControls(db);
  const protectedControls = await journalRetentionControls(
    db,
    journals.controls,
    undefined,
    signal
  );
  const inspected = await inspectRetentionOperations(db);
  let accountsErased = 0,
    accountsCompleted = 0,
    messages = 0,
    reports = 0,
    failed = protectedControls.failed + measurementFailure;
  for (const account of inspected.accounts) {
    if (signal.aborted) break;
    try {
      await db.accountDeletion.update({
        where: { id: account.id },
        data: { lastAttemptAt: new Date() }
      });
      if (!account.structuredPurgedAt) {
        await eraseRequestedAccountData(db, account.id, journals.accounts);
        accountsErased++;
      }
    } catch {
      failed++;
    }
  }
  // Re-inspection includes messages newly abandoned by the inspected closures.
  const candidates = (await inspectMessagingRetention(db)).candidates.slice(
    0,
    20
  );
  for (const candidate of candidates) {
    if (signal.aborted) break;
    try {
      const result = await runMessagingRetention(
        db,
        [candidate],
        journals.messages,
        new Date(),
        journals.controls
      );
      messages += result.messages;
      reports += result.reports;
    } catch {
      failed++;
    }
  }
  for (const account of inspected.accounts) {
    if (signal.aborted) break;
    try {
      if (
        !(await finalizeAccountDeletion(db, account.id, journals.accounts))
          .pending
      )
        accountsCompleted++;
    } catch {
      failed++;
    }
  }
  let expired = { controls: 0, messages: 0, accounts: 0 };
  if (!signal.aborted)
    try {
      expired = await expireRetentionReceipts(db, journals, new Date(), signal);
    } catch {
      failed++;
    }
  const remaining = await inspectRetentionOperations(db);
  return {
    seeded,
    feedSnapshotsExpired,
    measurementsExpired,
    protected: protectedControls.recorded,
    accountsErased,
    accountsCompleted,
    messages,
    reports,
    expired,
    failed,
    bounded: signal.aborted,
    pendingAccounts: remaining.pendingAccounts,
    pendingProtectedControls: remaining.pendingProtectedControls,
    remainingCandidates: remaining.candidates.length,
    overdueAccounts: remaining.overdueAccounts,
    overdueReviews: remaining.overdueReviews,
    overdueHolds: remaining.overdueHolds
  };
}
export async function handleRetentionMaintenance(
  db: PrismaClient,
  request: Request,
  journals = retentionJournals,
  signal = AbortSignal.timeout(40000)
) {
  const rejected = maintenanceRequestError(request);
  if (rejected) return rejected;
  const mode = new URL(request.url).searchParams.get("mode");
  if (mode && mode !== "inspect")
    return Response.json(
      { error: "Choose inspection or the configured maintenance run." },
      { status: 400, headers }
    );
  try {
    if (
      mode === "inspect" ||
      process.env.RETENTION_CLEANUP_ENABLED !== "true"
    ) {
      const plan = await inspectRetentionOperations(db);
      return Response.json(
        {
          enabled: process.env.RETENTION_CLEANUP_ENABLED === "true",
          mode: "inspect",
          candidates: plan.candidates.length,
          pendingAccounts: plan.pendingAccounts,
          pendingProtectedControls: plan.pendingProtectedControls,
          overdueAccounts: plan.overdueAccounts,
          overdueReviews: plan.overdueReviews,
          overdueHolds: plan.overdueHolds
        },
        { headers }
      );
    }
    const result = await runRetentionOperations(db, journals(), signal);
    const needsAttention =
      result.failed > 0 ||
      result.overdueAccounts > 0 ||
      result.overdueReviews > 0 ||
      result.overdueHolds > 0;
    console.info("retention_maintenance_completed", {
      ...result,
      needsAttention
    });
    return Response.json(
      { ok: !needsAttention, ...result, needsAttention },
      { status: needsAttention ? 503 : 200, headers }
    );
  } catch {
    console.error("retention_maintenance_incomplete");
    return Response.json(
      {
        error: "Retention maintenance did not finish. Pending work is retained."
      },
      { status: 503, headers }
    );
  }
}
