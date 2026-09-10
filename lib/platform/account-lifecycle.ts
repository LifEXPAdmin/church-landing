import type { Prisma, PrismaClient } from "@prisma/client";
import { AccountError, normalizeEmail } from "./accounts";
import { withOwnedSession } from "./account-sessions";
import { validatePassword, verifyPassword } from "./auth";
import { reconcileSupportAccess } from "./support-revocation";
import { requireAccountCredential } from "./account-credential";

export class AccountLifecycleError extends Error {
  code: "confirmation" | "handoff";
  constructor(code: AccountLifecycleError["code"]) {
    super(code);
    this.code = code;
  }
}

// Internal transition: caller must hold the user/access locks and validate a
// current password or the browser-bound Google reactivation proof for this user.
export async function reactivateVerifiedAccount(
  tx: Prisma.TransactionClient,
  userId: string
) {
  await tx.platformUser.update({
    where: { id: userId },
    data: {
      deactivatedAt: null,
      credentialVersion: { increment: 1 },
      portalVersion: { increment: 1 }
    }
  });
  await tx.platformSession.deleteMany({ where: { userId } });
  await tx.platformEmailChange.deleteMany({ where: { userId } });
  await tx.platformAccountGrant.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date() }
  });
}

export async function deactivateAccount(
  db: PrismaClient,
  token: unknown,
  password: unknown,
  confirmed: unknown
) {
  return withOwnedSession(
    db,
    token,
    async (tx, current) => {
      if (confirmed !== true) throw new AccountLifecycleError("confirmation");
      await requireAccountCredential(
        tx,
        current,
        password,
        "deactivate-account"
      );
      const userId = current.userId;
      // Role grants, appointments and case/intake ownership cannot be abandoned.
      // Check under the same transaction gate used to assign those duties.
      const duties = await Promise.all([
        tx.churchCapabilityGrant.count({ where: { userId, revokedAt: null } }),
        tx.platformOperatorGrant.count({ where: { userId, revokedAt: null } }),
        tx.churchContactAssignment.count({
          where: { userId, revokedAt: null }
        }),
        tx.supportCapabilityGrant.count({ where: { userId, revokedAt: null } }),
        tx.supportCase.count({ where: { ownerGrant: { userId } } }),
        tx.supportIntakeSetting.count({
          where: { enabled: true, ownerGrant: { userId } }
        })
      ]);
      if (duties.some(Boolean)) throw new AccountLifecycleError("handoff");
      const now = new Date();
      await tx.platformUser.update({
        where: { id: userId },
        data: {
          deactivatedAt: now,
          credentialVersion: { increment: 1 },
          portalVersion: { increment: 1 }
        }
      });
      await tx.platformSession.deleteMany({ where: { userId } });
      await tx.platformEmailChange.deleteMany({ where: { userId } });
      await tx.platformAccountGrant.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: now }
      });
      await tx.churchDirectoryPreference.deleteMany({
        where: { connection: { userId } }
      });
      await tx.churchConnection.updateMany({
        where: { userId },
        data: { version: { increment: 1 } }
      });
      // Ends existing coordinator consent and records the standard support audit.
      await reconcileSupportAccess(tx);
    },
    true
  );
}

export async function reactivateAccount(
  db: PrismaClient,
  emailInput: unknown,
  password: unknown,
  confirmed: unknown
) {
  if (confirmed !== true) throw new AccountLifecycleError("confirmation");
  const email = normalizeEmail(emailInput);
  if (!email || validatePassword(password))
    throw new AccountError("credentials");
  const snapshot = await db.platformUser.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, credentialVersion: true }
  });
  if (
    !(await verifyPassword(password, snapshot?.passwordHash ?? null)) ||
    !snapshot
  )
    throw new AccountError("credentials");
  await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      await tx.$queryRaw`SELECT "id" FROM "PlatformUser" WHERE "id" = ${snapshot.id} FOR UPDATE`;
      const current = await tx.platformUser.findUniqueOrThrow({
        where: { id: snapshot.id }
      });
      if (
        current.suspendedAt ||
        current.email !== email ||
        current.passwordHash !== snapshot.passwordHash ||
        current.credentialVersion !== snapshot.credentialVersion
      )
        throw new AccountError("credentials");
      if (!current.deactivatedAt) return;
      await reactivateVerifiedAccount(tx, current.id);
    },
    { maxWait: 5000, timeout: 15000 }
  );
}
