import type { PrismaClient } from "@prisma/client";
import { AccountError } from "./account-error";
import { withOwnedSession } from "./account-sessions";
import {
  accountSessionDeadline,
  accountSessionIsActive,
  nextAccountIdleExpiry,
  type AccountSessionLifetime
} from "./account-session-policy";

function state(owner: string, session: AccountSessionLifetime, now: Date) {
  return {
    owner,
    legacy: session.idleExpiresAt === null,
    deadline: accountSessionDeadline(session).toISOString(),
    absoluteExpiresAt: session.expiresAt.toISOString(),
    serverTime: now.toISOString()
  };
}

export async function readAccountSessionActivity(
  db: PrismaClient,
  token: unknown,
  expectedOwner?: string | null
) {
  return withOwnedSession(db, token, async (_tx, current) => {
    if (expectedOwner != null && expectedOwner !== current.userId)
      throw new AccountError("session");
    const now = new Date();
    if (!accountSessionIsActive(current, now))
      throw new AccountError("session");
    return state(current.userId, current, now);
  });
}

/** Only the explicit, same-origin foreground HTTP boundary calls this writer. */
export async function recordAccountSessionActivity(
  db: PrismaClient,
  token: unknown,
  expectedOwner: string
) {
  return withOwnedSession(db, token, async (tx, current) => {
    if (expectedOwner !== current.userId) throw new AccountError("session");
    // withOwnedSession acquired the account lock and revalidated credentials.
    // Take time here, after any wait, never from the browser or transaction start.
    const now = new Date();
    if (!accountSessionIsActive(current, now))
      throw new AccountError("session");
    const next = nextAccountIdleExpiry(current, now);
    if (!next) return state(current.userId, current, now);
    const updated = await tx.platformSession.updateMany({
      where: {
        id: current.id,
        userId: current.userId,
        credentialVersion: current.credentialVersion,
        expiresAt: { equals: current.expiresAt, gt: now },
        idleExpiresAt: current.idleExpiresAt
      },
      data: { idleExpiresAt: next }
    });
    // Logout may delete without the account lock. Never recreate its row, or
    // interpret a failed conditional write as a newly authorized session.
    if (updated.count !== 1) throw new AccountError("session");
    return state(current.userId, { ...current, idleExpiresAt: next }, now);
  });
}
