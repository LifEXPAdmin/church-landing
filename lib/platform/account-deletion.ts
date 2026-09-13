import type { AccountDeletion, Prisma, PrismaClient } from "@prisma/client";
import { AccountError } from "./account-error";
import { requireAccountCredential } from "./account-credential";
import { withOwnedSession } from "./account-sessions";
import {
  closeVerifiedAccountAccess,
  AccountLifecycleError
} from "./account-lifecycle";
import { hashSessionToken, validToken } from "./auth";
import {
  markUnretainedMessages,
  MESSAGING_RETENTION_POLICY,
  retentionDate
} from "./messaging-retention";

type Tx = Prisma.TransactionClient;
export type AccountDeletionRecord = {
  id: string;
  userId: string;
  requestedAt: string;
  policy: typeof MESSAGING_RETENTION_POLICY;
};
export interface AccountDeletionJournal {
  recordAccount(record: AccountDeletionRecord): Promise<void>;
  completeAccount?(
    record: AccountDeletionRecord,
    completedAt: string
  ): Promise<void>;
}

async function handoffsIn(tx: Tx, userId: string) {
  // Duties retain their original scope and the request clock. They must be
  // resolved through current authorized transfers, never by guessing a successor.
  return {
    churchAssignments: await tx.churchPositionAssignment.count({
      where: { connection: { userId }, revokedAt: null }
    }),
    churchCapabilities: await tx.churchCapabilityGrant.count({
      where: { userId, revokedAt: null }
    }),
    operatorCapabilities: await tx.platformOperatorGrant.count({
      where: { userId, revokedAt: null }
    }),
    contactAppointments: await tx.churchContactAssignment.count({
      where: { userId, revokedAt: null }
    }),
    supportCapabilities: await tx.supportCapabilityGrant.count({
      where: { userId, revokedAt: null }
    }),
    supportOwnership: await tx.supportCase.count({
      where: { ownerGrant: { userId }, status: { not: "CLOSED" } }
    }),
    supportIntake: await tx.supportIntakeSetting.count({
      where: { enabled: true, ownerGrant: { userId } }
    })
  };
}
export const accountDeletionRecord = (
  row: AccountDeletion
): AccountDeletionRecord => ({
  id: row.id,
  userId: row.userId,
  requestedAt: row.requestedAt.toISOString(),
  policy: MESSAGING_RETENTION_POLICY
});
function progress(row: AccountDeletion) {
  return {
    accepted: true as const,
    requestedAt: row.requestedAt.toISOString(),
    activeDataDueAt: row.dueAt.toISOString(),
    structuredPurgedAt: row.structuredPurgedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    protectedJournalReady: !!row.journaledAt,
    handoffs: row.exceptions,
    policy: row.policy
  };
}
export type AccountDeletionProgress = ReturnType<typeof progress>;

export async function readAccountDeletionProgress(
  db: PrismaClient,
  proof: unknown
) {
  if (!validToken(proof)) throw new AccountError("credentials");
  const row = await db.accountDeletion.findUnique({
    where: { proofHash: hashSessionToken(proof) }
  });
  // This separate capability shows only dates/progress and duty counts. It
  // cannot authenticate the erased account or reveal its identity/content.
  if (
    !row ||
    (row.completedAt && retentionDate(row.completedAt, 90) <= new Date())
  )
    throw new AccountError("credentials");
  return progress(row);
}

export async function requestPermanentAccountDeletion(
  db: PrismaClient,
  token: unknown,
  credential: unknown,
  confirmed: unknown,
  proof: unknown,
  journal: AccountDeletionJournal,
  expectedOwnerId?: unknown
) {
  if (!validToken(proof)) throw new AccountError("credentials");
  // The same high-entropy progress capability can confirm an accepted request
  // after its response was lost and the account session was already revoked.
  const prior = await db.accountDeletion.findUnique({
    where: { proofHash: hashSessionToken(proof) }
  });
  if (prior) {
    if (expectedOwnerId !== undefined && prior.userId !== expectedOwnerId)
      throw new AccountError("session");
    return readAccountDeletionProgress(db, proof);
  }
  const row = await withOwnedSession(
    db,
    token,
    async (tx, current) => {
      if (expectedOwnerId !== undefined && current.userId !== expectedOwnerId)
        throw new AccountError("session");
      if (confirmed !== true) throw new AccountLifecycleError("confirmation");
      await requireAccountCredential(tx, current, credential, "delete-account");
      const owner = await tx.platformUser.findUniqueOrThrow({
        where: { id: current.userId },
        select: { emailVerifiedAt: true }
      });
      if (!owner.emailVerifiedAt) throw new AccountError("credentials");
      const now = new Date();
      const request = await tx.accountDeletion.create({
        data: {
          userId: current.userId,
          proofHash: hashSessionToken(proof),
          requestedAt: now,
          dueAt: retentionDate(now, 30),
          policy: MESSAGING_RETENTION_POLICY,
          exceptions: await handoffsIn(tx, current.userId)
        }
      });
      await closeVerifiedAccountAccess(tx, current.userId, now, true);
      await markUnretainedMessages(tx, now, undefined, current.userId);
      return request;
    },
    true
  );
  // Access is already revoked even when the journal provider is temporarily
  // unavailable. The recorded request remains accepted with its original clock.
  // Erasure itself must wait for durable journal acknowledgement.
  try {
    await journal.recordAccount(accountDeletionRecord(row));
    const saved = await db.accountDeletion.update({
      where: { id: row.id },
      data: { journaledAt: new Date() }
    });
    return progress(saved);
  } catch {
    return progress(row);
  }
}

export async function refreshAccountDeletionHandoffs(
  tx: Tx,
  row: AccountDeletion
) {
  return tx.accountDeletion.update({
    where: { id: row.id },
    data: { exceptions: await handoffsIn(tx, row.userId) }
  });
}
