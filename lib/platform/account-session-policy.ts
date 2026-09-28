/** Pure lifetime policy. Reads, polling and background jobs never renew it. */
export const ACCOUNT_IDLE_SECONDS = 30 * 60;
export const ACCOUNT_ACTIVITY_INTERVAL_SECONDS = 60;

// Existing sessions have no trustworthy interaction history. Their existing
// absolute expiry is preserved until an explicit activity request adopts idle
// protection, with this fixed outer bound for the migration interval.
export const LEGACY_IDLE_ENDS_AT = "2026-10-29T00:00:00.000Z";

export type AccountSessionLifetime = {
  expiresAt: Date;
  idleExpiresAt: Date | null;
};

export function accountSessionDeadline(session: AccountSessionLifetime) {
  return new Date(
    Math.min(
      session.expiresAt.getTime(),
      session.idleExpiresAt?.getTime() ?? Date.parse(LEGACY_IDLE_ENDS_AT)
    )
  );
}

export function accountSessionIsActive(
  session: AccountSessionLifetime,
  now = new Date()
) {
  // Invalid timestamps fail closed, including invalid clock input in callers.
  return accountSessionDeadline(session).getTime() > now.getTime();
}

export function initialAccountIdleExpiry(now = new Date()) {
  return new Date(now.getTime() + ACCOUNT_IDLE_SECONDS * 1000);
}

/**
 * Called only after current account/session checks and blocking owner locks.
 * A minute of bounded tolerance permits at most one write per active minute
 * without expiring earlier than thirty minutes after a qualifying interaction.
 * A null result means no update is needed, NOT that the session is authorized.
 */
export function nextAccountIdleExpiry(
  session: AccountSessionLifetime,
  now = new Date()
): Date | null {
  if (!accountSessionIsActive(session, now)) return null;
  const threshold = now.getTime() + ACCOUNT_IDLE_SECONDS * 1000;
  if (session.idleExpiresAt && session.idleExpiresAt.getTime() > threshold)
    return null;
  const next = new Date(
    Math.min(
      session.expiresAt.getTime(),
      threshold + ACCOUNT_ACTIVITY_INTERVAL_SECONDS * 1000
    )
  );
  if (session.idleExpiresAt && next <= session.idleExpiresAt) return null;
  return next;
}
