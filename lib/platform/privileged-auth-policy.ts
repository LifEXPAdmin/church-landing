import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { effectiveChurchGrants } from "./church-permissions";
import { eligibleWhere, PortalError } from "./portal-policy";
import { founderAccountId } from "./founder-config";
import { privilegedSession } from "./privileged-session";
import { privilegedPurposeNames } from "./privileged-auth-navigation";

type Tx = Prisma.TransactionClient;
export const privilegedPurposes = privilegedPurposeNames;
export type PrivilegedPurpose = (typeof privilegedPurposes)[number];
export function privilegedMode() {
  const mode = process.env.PRIVILEGED_MFA_MODE ?? "off";
  if (mode !== "off" && mode !== "enroll" && mode !== "enforce")
    throw new Error("Privileged authentication configuration is invalid");
  return mode;
}
export function privilegedPurpose(value: unknown): PrivilegedPurpose {
  if (!privilegedPurposes.includes(value as PrivilegedPurpose))
    throw new PortalError(400, "Choose an available protected action.");
  return value as PrivilegedPurpose;
}

export async function privilegedAuthority(tx: Tx, userId: string) {
  const actor = await tx.platformUser.findFirst({
    where: { id: userId, ...eligibleWhere },
    select: { id: true, username: true }
  });
  if (!actor) return null;
  const [operators, support, churches, topics, memberships, appointments] = await Promise.all([
    tx.platformOperatorGrant.findMany({
      where: { userId, revokedAt: null },
      select: { id: true, capability: true, version: true }, take: 501
    }),
    tx.supportCapabilityGrant.findMany({
      where: { userId, revokedAt: null },
      select: { id: true, capability: true, version: true }, take: 501
    }),
    effectiveChurchGrants(tx, userId),
    tx.topicCommunity.findMany({
      where: { ownerId: userId, recoveryRequired: false },
      select: { id: true, version: true }, take: 501
    }),
    tx.topicMembership.findMany({
      where: { userId, joined: true, moderator: true, restrictedAt: null,
        community: { recoveryRequired: false, lifecycle: "ACTIVE", moderationState: "VISIBLE" } },
      select: { id: true, version: true }, take: 501
    }),
    tx.churchContactAssignment.findMany({
      where: { userId, revokedAt: null, slot: { in: ["PRIMARY", "BACKUP"] }, connection: { state: "APPROVED", userId } },
      select: { id: true, version: true }, take: 501
    })
  ]);
  if ([operators, support, churches, topics, memberships, appointments].some(r => r.length > 500))
    throw new PortalError(503, "Your assigned duties need a size review before confirmation.");
  const rows = [
    ...operators.map(g => ["operator", g.id, g.capability, g.version]),
    ...support.map(g => ["support", g.id, g.capability, g.version]),
    ...churches.map(g => ["church", g.id, g.capability, g.version, g.assignmentId]),
    ...topics.map(g => ["topic-owner", g.id, g.version]),
    ...memberships.map(g => ["topic-moderator", g.id, g.version]),
    ...appointments.map(g => ["coordinator", g.id, g.version])
  ];
  const hasDuties = rows.length > 0;
  if (founderAccountId() === userId && operators.some(g => g.capability === "REVIEW_COMMUNITY_REPORTS"))
    rows.push(["founder", userId]);
  const digest = createHash("sha256")
    .update(JSON.stringify([userId, rows.map(r => JSON.stringify(r)).sort()])).digest("hex");
  return { actor, digest, hasDuties };
}

export class PrivilegedAuthenticationError extends PortalError {
  readonly challengeHref = "/platform/account/authenticator";
  readonly purpose: PrivilegedPurpose;
  readonly enrollment: boolean;
  constructor(purpose: PrivilegedPurpose, enrollment: boolean) {
    super(403, enrollment
      ? "Set up your authenticator in Account security before using assigned duties. Your personal account remains available."
      : "Confirm your authenticator in Account security, then retry this protected action. Keep your unsent entries.");
    this.purpose = purpose;
    this.enrollment = enrollment;
  }
}

export async function privilegedAssurance(tx: Tx, userId: string, purpose: PrivilegedPurpose = "privileged-work") {
  const session = privilegedSession(tx, userId);
  if (!session) return false;
  // Most ordinary sessions have no proof. One indexed read avoids loading every
  // privilege source on each ordinary feed or calendar request.
  const proof = await tx.privilegedSessionProof.findUnique({ where: { sessionId_purpose: { sessionId: session.id, purpose } } });
  const now = new Date();
  if (!proof || proof.consumedAt || proof.confirmedAt > now || proof.expiresAt <= now ||
    proof.credentialVersion !== session.credentialVersion) return false;
  const [authority, factor] = await Promise.all([
    privilegedAuthority(tx, userId),
    tx.adminAuthenticator.findUnique({ where: { userId }, select: { version: true, confirmedAt: true, quarantinedAt: true } })
  ]);
  return !!(authority && factor?.confirmedAt && !factor.quarantinedAt &&
    proof.factorVersion === factor.version &&
    proof.authorityDigest === authority.digest);
}

// Role calculations also serve background audience/revocation workers. Those
// retain raw authority, while every bound browser session gets only its currently
// challenged privileged projection. This helper never supplies authentication.
export async function privilegedProjectionAvailable(tx: Tx, userId: string) {
  return privilegedMode() !== "enforce" || !privilegedSession(tx, userId) ||
    await privilegedAssurance(tx, userId);
}

const consumed = new WeakMap<object, Set<string>>();
export function privilegedErrorFields(error: unknown) {
  return error instanceof PrivilegedAuthenticationError
    ? { authenticatorPurpose: error.purpose } : {};
}
export async function requirePrivilegedAuthentication(
  tx: Tx, userId: string, purpose: PrivilegedPurpose = "privileged-work"
) {
  if (privilegedMode() !== "enforce") return;
  if (purpose !== "privileged-work" && consumed.get(tx)?.has(userId + ":" + purpose)) return;
  if (!(await privilegedAssurance(tx, userId, purpose))) {
    const factor = await tx.adminAuthenticator.findUnique({ where: { userId }, select: { confirmedAt: true } });
    throw new PrivilegedAuthenticationError(purpose, !factor?.confirmedAt);
  }
  if (purpose !== "privileged-work") {
    const session = privilegedSession(tx, userId)!;
    const result = await tx.privilegedSessionProof.updateMany({
      where: { sessionId: session.id, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() }
    });
    if (result.count !== 1) throw new PrivilegedAuthenticationError(purpose, false);
    const used = consumed.get(tx) ?? new Set<string>();
    used.add(userId + ":" + purpose);
    consumed.set(tx, used);
  }
}
