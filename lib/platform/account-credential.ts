import type { Prisma } from "@prisma/client";
import { AccountError } from "./accounts";
import { hashSessionToken, validToken, verifyPassword } from "./auth";

export const recentAuthenticationPurposes = [
  "change-password",
  "revoke-other-sessions",
  "prepare-export",
  "deactivate-account",
  "request-email-change",
  "confirm-email-change",
  "unlink-google"
] as const;
export type RecentAuthenticationPurpose =
  (typeof recentAuthenticationPurposes)[number];
export type GoogleCredential = { kind: "google-reauth"; token: string };
export function isGoogleCredential(value: unknown): value is GoogleCredential {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return (
    Object.keys(entry).length === 2 &&
    entry.kind === "google-reauth" &&
    validToken(entry.token)
  );
}
export function isRecentAuthenticationPurpose(
  value: unknown
): value is RecentAuthenticationPurpose {
  return (
    typeof value === "string" &&
    recentAuthenticationPurposes.some((purpose) => purpose === value)
  );
}

// Called only inside an existing owner/session transaction after the user lock
// and active-session checks. The service chooses the purpose, never the request.
export async function requireAccountCredential(
  tx: Prisma.TransactionClient,
  current: {
    id: string;
    userId: string;
    credentialVersion: number;
    user: { passwordHash: string | null };
  },
  credential: unknown,
  purpose: RecentAuthenticationPurpose
) {
  if (!isGoogleCredential(credential)) {
    if (!(await verifyPassword(credential, current.user.passwordHash)))
      throw new AccountError("credentials");
    return;
  }
  const proof = await tx.platformRecentAuthentication.findUnique({
    where: { tokenHash: hashSessionToken(credential.token) },
    include: { googleIdentity: { select: { userId: true } } }
  });
  if (
    !proof ||
    proof.userId !== current.userId ||
    proof.googleIdentity.userId !== current.userId ||
    proof.sessionId !== current.id ||
    proof.credentialVersion !== current.credentialVersion ||
    proof.purpose !== purpose ||
    proof.expiresAt <= new Date()
  )
    throw new AccountError("credentials");
  const consumed = await tx.platformRecentAuthentication.deleteMany({
    where: { id: proof.id, tokenHash: proof.tokenHash }
  });
  if (consumed.count !== 1) throw new AccountError("credentials");
}
