import type { PrismaClient } from "@prisma/client";
import { createHmac } from "node:crypto";
import { withOwnedSession } from "./account-sessions";
import { readAccountSession } from "./accounts";
import { allowAccountAttempt } from "./account-limits";
import { accountConfig } from "./account-config";
import { accountDeliveryAvailable } from "./account-availability";
import { googleAvailable } from "./google-availability";
import { requireAccountCredential } from "./account-credential";
import { adminFields, adminRequestKey } from "./admin-input";
import { adminPriorOperation, recordAdminOperation } from "./admin-cases";
import { expected, PortalError } from "./portal-policy";
import {
  authenticatorSecret, authenticatorBase32, sealAuthenticator,
  openAuthenticator, verifyAuthenticatorCode, authenticatorRecoveryCodes,
  authenticatorRecoveryHash
} from "./admin-authenticator-crypto";
import {
  privilegedAuthority, privilegedMode, privilegedPurpose,
  privilegedAssurance, type PrivilegedPurpose
} from "./privileged-auth-policy";

const unavailable = () => new PortalError(503, "Authenticator setup is not available yet. Your personal account remains available.");
export function readPrivilegedAuthentication(db: PrismaClient, token: unknown) {
  return withOwnedSession(db, token, async (tx, session) => {
    const authority = await privilegedAuthority(tx, session.userId);
    const factor = await tx.adminAuthenticator.findUnique({ where: { userId: session.userId } });
    const notices = await tx.privilegedSecurityNotice.findMany({
      where: { userId: session.userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10,
      select: { id: true, action: true, createdAt: true, deliveredAt: true }
    });
    return {
      ownerId: session.userId, username: authority?.actor.username ?? "",
      viewKey: createHmac("sha256", accountConfig().rateSecret + ":authenticator-view")
        .update(session.id + ":" + session.credentialVersion).digest("hex"),
      eligible: !!authority, hasDuties: authority?.hasDuties ?? false,
      mode: privilegedMode(), available: privilegedMode() !== "off" && accountDeliveryAvailable(),
      googleAvailable: googleAvailable(),
      factor: factor ? { version: factor.version, confirmed: !!factor.confirmedAt,
        quarantined: !!factor.quarantinedAt, recoveryCodesRemaining: factor.recoveryHashes.length,
        expiresAt: factor.confirmedAt ? null : factor.expiresAt.toISOString() } : null,
      confirmedForWork: !!authority && await privilegedAssurance(tx, session.userId),
      notices: notices.map(n => ({ ...n, createdAt: n.createdAt.toISOString(), deliveredAt: n.deliveredAt?.toISOString() ?? null }))
    };
  }, "shared");
}
export type PrivilegedAuthenticationSnapshot = Awaited<ReturnType<typeof readPrivilegedAuthentication>>;

export async function privilegedAuthenticatorCommand(
  db: PrismaClient, token: unknown, input: Record<string, unknown>, credential: unknown
) {
  adminFields(input, ["operation", "requestKey", "expectedVersion", "currentPassword", "credentialMethod", "code", "recoveryCode", "purpose"]);
  const operation = String(input.operation), key = adminRequestKey(input.requestKey);
  if (!["mfa-start", "mfa-confirm", "mfa-recover", "mfa-replace", "mfa-challenge"].includes(operation))
    throw new PortalError(400, "Choose an authenticator action.");
  if (privilegedMode() === "off" || !accountDeliveryAvailable()) throw unavailable();
  const actor = await readAccountSession(db, token);
  if (!actor) throw new PortalError(401, "Sign in to manage your authenticator.");
  if (!(await allowAccountAttempt(db, accountConfig().rateSecret + ":privileged-authenticator", "verify", actor.id, actor.id)))
    throw new PortalError(429, "Too many authenticator attempts. Keep your unsent work and retry in fifteen minutes.", 900);
  return withOwnedSession(db, token, async (tx, session) => {
    const authority = await privilegedAuthority(tx, session.userId);
    if (!authority) throw new PortalError(403, "Verify your account email and adult eligibility before setting up an authenticator.");
    const userId = session.userId;
    const row = await tx.adminAuthenticator.findUnique({ where: { userId } });
    if (row?.quarantinedAt)
      throw new PortalError(403, "This authenticator was retired during protected recovery. Trusted identity review is required before assigned duties can resume. Personal account access remains available.");
    const retry = await adminPriorOperation(tx, userId, input);
    if (retry.prior) {
      if (!row || (operation !== "mfa-challenge" && (row.sessionId !== session.id || row.credentialVersion !== session.credentialVersion)))
        throw new PortalError(409, "This confirmation belongs to another sign-in. Open your current authenticator settings.");
      if (operation === "mfa-confirm" && row.confirmationRequestKey === key && row.confirmedAt && row.confirmedAt.getTime() + 600000 > Date.now())
        return { ...retry.prior, recoveryCodes: authenticatorRecoveryCodes(openAuthenticator(userId, row.secretCiphertext), key) };
      if (["mfa-start", "mfa-recover", "mfa-replace"].includes(operation) && row.enrollmentRequestKey === key && !row.confirmedAt && row.expiresAt > new Date())
        return { ...retry.prior, secret: authenticatorBase32(openAuthenticator(userId, row.secretCiphertext)) };
      if (operation === "mfa-challenge") {
        const purpose = privilegedPurpose(input.purpose);
        const proof = await tx.privilegedSessionProof.findUnique({ where: { sessionId_purpose: { sessionId: session.id, purpose } } });
        if (proof?.requestKey === key && await privilegedAssurance(tx, userId, purpose)) return retry.prior;
      }
      throw new PortalError(409, "This authenticator operation has expired or changed. Review the current status before retrying.");
    }
    expected(input.expectedVersion, row?.version ?? 0);
    const audit = async (result: { version: number; [key: string]: unknown }) => {
      await recordAdminOperation(tx, userId, input, { sourceType: "MFA", sourceId: userId }, result);
      return result;
    };
    if (operation === "mfa-confirm") {
      if (!row || row.confirmedAt || row.expiresAt <= new Date() || row.sessionId !== session.id || row.credentialVersion !== session.credentialVersion)
        throw new PortalError(409, "Confirm a current authenticator setup from this sign-in.");
      const secret = openAuthenticator(userId, row.secretCiphertext);
      const counter = verifyAuthenticatorCode(secret, input.code, row.lastCounter);
      const codes = authenticatorRecoveryCodes(secret, key);
      const factor = await tx.adminAuthenticator.update({ where: { userId }, data: {
        confirmedAt: new Date(), confirmationRequestKey: key, lastCounter: counter,
        recoveryRequired: true, recoveryHashes: codes.map(c => authenticatorRecoveryHash(userId, c)), version: { increment: 1 }
      } });
      await tx.privilegedSecurityNotice.create({ data: { userId, factorVersion: factor.version, action: "confirmed" } });
      const result = await audit({ version: factor.version, message: "Authenticator confirmed. Save these eight private recovery codes. Each code can replace a lost authenticator once." });
      return { ...result, recoveryCodes: codes };
    }
    if (operation === "mfa-challenge") {
      if (!row?.confirmedAt) throw new PortalError(403, "Confirm your authenticator setup first.");
      const purpose = privilegedPurpose(input.purpose);
      const counter = verifyAuthenticatorCode(openAuthenticator(userId, row.secretCiphertext), input.code, row.lastCounter);
      await tx.adminAuthenticator.update({ where: { userId }, data: { lastCounter: counter } });
      const now = new Date();
      const save = async (purpose: PrivilegedPurpose, milliseconds: number) => {
        const values = { requestKey: key, factorVersion: row.version, credentialVersion: session.credentialVersion,
          authorityDigest: authority.digest, confirmedAt: now, expiresAt: new Date(now.getTime() + milliseconds), consumedAt: null };
        await tx.privilegedSessionProof.upsert({ where: { sessionId_purpose: { sessionId: session.id, purpose } },
          create: { sessionId: session.id, purpose, ...values }, update: values });
      };
      await save("privileged-work", 600000);
      if (purpose !== "privileged-work") await save(purpose, 300000);
      return audit({ version: row.version, message: purpose === "privileged-work"
        ? "Assigned duties are confirmed in this sign-in for ten minutes."
        : "This protected action is confirmed once for five minutes. Return to your retained form and retry." });
    }
    await requireAccountCredential(tx, session, credential, "manage-privileged-authenticator");
    if (operation === "mfa-start") {
      if (row?.confirmedAt) throw new PortalError(409, "Use your existing authenticator or one recovery code to replace this factor.");
      if (row?.recoveryRequired && (row.sessionId !== session.id || row.credentialVersion !== session.credentialVersion))
        throw new PortalError(403, "Resume the replacement from its original sign-in. Otherwise trusted identity review is required.");
    } else {
      if (!row?.confirmedAt) throw new PortalError(409, "There is no confirmed authenticator to replace.");
      if (operation === "mfa-recover") {
        let hash: string;
        try { hash = authenticatorRecoveryHash(userId, input.recoveryCode); }
        catch (error) {
          if (error instanceof PortalError && error.status === 403) throw new PortalError(400, error.message);
          throw error;
        }
        if (!row.recoveryHashes.includes(hash))
          throw new PortalError(400, "That recovery code is invalid or already used.");
      } else verifyAuthenticatorCode(openAuthenticator(userId, row.secretCiphertext), input.code, row.lastCounter);
      await tx.platformSession.deleteMany({ where: { userId, id: { not: session.id } } });
    }
    await tx.privilegedSessionProof.deleteMany({ where: { session: { userId } } });
    const secret = authenticatorSecret(), expiresAt = new Date(Date.now() + 600000);
    const values = { secretCiphertext: sealAuthenticator(userId, secret), credentialVersion: session.credentialVersion,
      sessionId: session.id, enrollmentRequestKey: key, confirmationRequestKey: null, startedAt: new Date(),
      confirmedAt: null, expiresAt, lastCounter: BigInt(-1), recoveryHashes: [] as string[] };
    const saved = await tx.adminAuthenticator.upsert({ where: { userId },
      create: { userId, ...values }, update: { ...values, version: { increment: 1 } } });
    if (operation !== "mfa-start")
      await tx.privilegedSecurityNotice.create({ data: { userId, factorVersion: saved.version, action: operation === "mfa-recover" ? "recovered" : "replaced" } });
    const result = await audit({ version: saved.version, expiresAt: expiresAt.toISOString(), message: operation === "mfa-start"
      ? "Add this private key to your authenticator and confirm a code within ten minutes."
      : "Previous factors, recovery codes and other sign-ins are retired. Confirm your replacement in this sign-in within ten minutes." });
    return { ...result, secret: authenticatorBase32(secret) };
  }, true);
}
