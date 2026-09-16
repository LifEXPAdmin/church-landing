import { privilegedMode } from "./privileged-auth-policy";
import {
  OperatorCapability,
  type PrismaClient,
  type SupportCapability
} from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import { readAccountSession } from "./accounts";
import { requireAccountCredential } from "./account-credential";
import { allowAccountAttempt } from "./account-limits";
import { googleAvailable } from "./google-availability";
import { accountConfig } from "./account-config";
import {
  adminAuthority,
  adminDenied,
  requireAdminCapability,
  withAdmin
} from "./admin-authority";
import { adminFields, adminRequestKey } from "./admin-input";
import { adminPriorOperation, recordAdminOperation } from "./admin-cases";
import { expected, isEligible, PortalError } from "./portal-policy";
import { postField } from "./post-input";
import { reconcileSupportAccess } from "./support-revocation";
import {
  authenticatorSecret,
  authenticatorBase32,
  sealAuthenticator,
  openAuthenticator,
  verifyAuthenticatorCode,
  authenticatorRecoveryCodes,
  authenticatorRecoveryHash
} from "./admin-authenticator-crypto";
const supports = ["RESPOND", "ASSIGN", "REDACT"];

export async function readAdminAccess(
  db: PrismaClient,
  token: unknown,
  username?: unknown
) {
  const query = postField(username ?? "", 40)
    .replace(/^@/, "")
    .toLowerCase();
  return withAdmin(db, token, async (tx, a) => {
    const manager = requireAdminCapability(a, "MANAGE_ADMIN_ACCESS");
    const factor = await tx.adminAuthenticator.findUnique({
      where: { userId: a.actor.id },
      select: {
        version: true,
        confirmedAt: true,
        expiresAt: true,
        recoveryHashes: true
      }
    });
    const target = query
      ? await tx.platformUser.findUnique({
          where: { username: query },
          select: {
            id: true,
            name: true,
            username: true,
            emailVerifiedAt: true,
            adultAcknowledgedAt: true,
            adultPolicyVersion: true,
            suspendedAt: true,
            deactivatedAt: true,
            operatorGrants: {
              select: {
                id: true,
                capability: true,
                version: true,
                revokedAt: true
              }
            },
            supportGrants: {
              select: {
                id: true,
                capability: true,
                version: true,
                revokedAt: true
              }
            }
          }
        })
      : null;
    return {
      navigation: a.navigation,
      managerVersion: manager.version,
      googleAvailable: googleAvailable(),
      accountAuthenticator: privilegedMode() !== "off",
      authenticator: factor
        ? {
            version: factor.version,
            confirmed: !!factor.confirmedAt,
            expiresAt: factor.confirmedAt
              ? null
              : factor.expiresAt.toISOString(),
            recoveryCodesRemaining: factor.recoveryHashes.length
          }
        : null,
      query,
      target: target
        ? {
            id: target.id,
            name: target.name,
            username: target.username,
            eligible: isEligible(target),
            grants: [...target.operatorGrants, ...target.supportGrants].map(
              (g) => ({
                id: g.id,
                capability: g.capability,
                version: g.version,
                active: !g.revokedAt
              })
            )
          }
        : null
    };
  });
}
export type AdminAccessSnapshot = Awaited<ReturnType<typeof readAdminAccess>>;

// These limits commit before the credential transaction so incorrect guesses
// are still counted when verification rolls the requested action back.
async function limitAdminCredential(db: PrismaClient, token: unknown) {
  const actor = await readAccountSession(db, token);
  if (!actor)
    throw new PortalError(401, "Sign in to confirm this admin action.");
  if (
    !(await allowAccountAttempt(
      db,
      accountConfig().rateSecret + ":admin-authenticator",
      "verify",
      actor.id,
      actor.id
    ))
  )
    throw new PortalError(
      429,
      "Too many authenticator attempts. Wait fifteen minutes, keeping your unsent action.",
      900
    );
}
export async function adminAuthenticatorCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>,
  credential: unknown
) {
  if (privilegedMode() !== "off")
    throw new PortalError(403, "Manage your authenticator in Account security, then return to this access form.");
  adminFields(input, [
    "operation",
    "requestKey",
    "managerVersion",
    "expectedVersion",
    "currentPassword",
    "credentialMethod",
    "code",
    "recoveryCode"
  ]);
  const op = String(input.operation),
    key = adminRequestKey(input.requestKey);
  if (!["mfa-start", "mfa-confirm", "mfa-recover"].includes(op))
    throw new PortalError(400, "Choose an authenticator action.");
  await limitAdminCredential(db, token);
  return withOwnedSession(
    db,
    token,
    async (tx, current) => {
      const a = await adminAuthority(tx, current.userId),
        manager = requireAdminCapability(a, "MANAGE_ADMIN_ACCESS");
      expected(input.managerVersion, manager.version);
      const row = await tx.adminAuthenticator.findUnique({
        where: { userId: a.actor.id }
      });
      if (row?.quarantinedAt)
        throw new PortalError(403, "This factor was retired during protected recovery. Trusted identity review is required.");
      const retry = await adminPriorOperation(tx, a.actor.id, input);
      if (retry.prior) {
        if (!row || row.sessionId !== current.id) throw adminDenied();
        if (
          op === "mfa-confirm" &&
          row.confirmationRequestKey === key &&
          row.confirmedAt
        )
          return {
            ...retry.prior,
            recoveryCodes: authenticatorRecoveryCodes(
              openAuthenticator(a.actor.id, row.secretCiphertext),
              key
            )
          };
        if (
          op !== "mfa-confirm" &&
          row.enrollmentRequestKey === key &&
          !row.confirmedAt &&
          row.expiresAt > new Date() &&
          row.credentialVersion === current.credentialVersion
        )
          return {
            ...retry.prior,
            secret: authenticatorBase32(
              openAuthenticator(a.actor.id, row.secretCiphertext)
            )
          };
        throw new PortalError(
          409,
          "This authenticator setup has changed or expired. Open the current setup."
        );
      }
      expected(input.expectedVersion, row?.version ?? 0);
      if (op === "mfa-confirm") {
        if (
          !row ||
          row.confirmedAt ||
          row.expiresAt <= new Date() ||
          row.sessionId !== current.id ||
          row.credentialVersion !== current.credentialVersion
        )
          throw new PortalError(
            409,
            "Confirm a current authenticator setup from this session."
          );
        const secret = openAuthenticator(a.actor.id, row.secretCiphertext),
          counter = verifyAuthenticatorCode(
            secret,
            input.code,
            row.lastCounter
          ),
          codes = authenticatorRecoveryCodes(secret, key);
        const next = await tx.adminAuthenticator.update({
          where: { userId: a.actor.id },
          data: {
            confirmedAt: new Date(),
            confirmationRequestKey: key,
            lastCounter: counter,
            recoveryHashes: codes.map((code) =>
              authenticatorRecoveryHash(a.actor.id, code)
            ),
            version: { increment: 1 }
          },
          select: { version: true }
        });
        const result = {
          version: next.version,
          message:
            "Authenticator confirmed. Store these eight recovery codes somewhere private; each can be used once."
        };
        await recordAdminOperation(
          tx,
          a.actor.id,
          input,
          { sourceType: "MFA", sourceId: a.actor.id },
          result
        );
        return { ...result, recoveryCodes: codes };
      }
      await requireAccountCredential(
        tx,
        current,
        credential,
        "manage-admin-authenticator"
      );
      if (op === "mfa-start" && row?.confirmedAt)
        throw new PortalError(
          409,
          "An authenticator is already confirmed. Use a recovery code to replace a lost authenticator."
        );
      if (op === "mfa-recover") {
        if (
          !row?.confirmedAt ||
          !row.recoveryHashes.includes(
            authenticatorRecoveryHash(a.actor.id, input.recoveryCode)
          )
        )
          throw new PortalError(
            403,
            "That recovery code is invalid or already used."
          );
        await tx.platformSession.deleteMany({
          where: { userId: a.actor.id, id: { not: current.id } }
        });
      }
      const secret = authenticatorSecret(),
        expiresAt = new Date(Date.now() + 600000);
      const values = {
        secretCiphertext: sealAuthenticator(a.actor.id, secret),
        credentialVersion: current.credentialVersion,
        sessionId: current.id,
        enrollmentRequestKey: key,
        confirmationRequestKey: null,
        startedAt: new Date(),
        confirmedAt: null,
        expiresAt,
        lastCounter: BigInt(-1),
        recoveryHashes: []
      };
      const saved = await tx.adminAuthenticator.upsert({
        where: { userId: a.actor.id },
        create: { userId: a.actor.id, ...values },
        update: { ...values, version: { increment: 1 } },
        select: { version: true }
      });
      const result = {
        version: saved.version,
        expiresAt: expiresAt.toISOString(),
        message:
          op === "mfa-recover"
            ? "Old authenticator and recovery codes retired; other sessions signed out. Confirm the replacement before changing access."
            : "Add this key to your authenticator, then confirm its next code within ten minutes."
      };
      await recordAdminOperation(
        tx,
        a.actor.id,
        input,
        { sourceType: "MFA", sourceId: a.actor.id },
        result
      );
      return { ...result, secret: authenticatorBase32(secret) };
    },
    true
  );
}
export async function adminGrantCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>,
  credential: unknown
) {
  adminFields(input, [
    "operation",
    "requestKey",
    "managerVersion",
    "expectedVersion",
    "username",
    "capability",
    "enabled",
    "reason",
    "currentPassword",
    "credentialMethod",
    "code"
  ]);
  if (input.operation !== "grant" || typeof input.enabled !== "boolean")
    throw new PortalError(400, "Choose a grant or revocation.");
  const capability = postField(input.capability, 60, 1),
    isSupport = supports.includes(capability);
  if (!isSupport && !Object.hasOwn(OperatorCapability, capability))
    throw new PortalError(400, "Choose an existing explicit capability.");
  const username = postField(input.username, 40, 1)
      .replace(/^@/, "")
      .toLowerCase(),
    reason = postField(input.reason, 500, 5);
  await limitAdminCredential(db, token);
  return withOwnedSession(
    db,
    token,
    async (tx, current) => {
      const a = await adminAuthority(tx, current.userId),
        manager = requireAdminCapability(a, "MANAGE_ADMIN_ACCESS");
      expected(input.managerVersion, manager.version);
      const target = await tx.platformUser.findUnique({
        where: { username },
        select: {
          id: true,
          emailVerifiedAt: true,
          adultAcknowledgedAt: true,
          adultPolicyVersion: true,
          suspendedAt: true,
          deactivatedAt: true
        }
      });
      if (!target) throw adminDenied();
      if (target.id === a.actor.id)
        throw new PortalError(
          403,
          "An access manager cannot change their own grants. Use the trusted operator assignment process."
        );
      const retry = await adminPriorOperation(tx, a.actor.id, input);
      if (retry.prior) return retry.prior;
      if (input.enabled && !isEligible(target))
        throw new PortalError(
          409,
          "The recipient must be an active, verified adult before a grant can be assigned."
        );
      const grant = isSupport
        ? await tx.supportCapabilityGrant.findUnique({
            where: {
              userId_capability: {
                userId: target.id,
                capability: capability as SupportCapability
              }
            }
          })
        : await tx.platformOperatorGrant.findUnique({
            where: {
              userId_capability: {
                userId: target.id,
                capability: capability as OperatorCapability
              }
            }
          });
      expected(input.expectedVersion, grant?.version ?? 0);
      if ((!!grant && !grant.revokedAt) === input.enabled)
        throw new PortalError(
          409,
          "This capability already has the requested state. Refresh before changing it."
        );
      await requireAccountCredential(
        tx,
        current,
        credential,
        "manage-admin-access"
      );
      const factor = await tx.adminAuthenticator.findUnique({
        where: { userId: a.actor.id }
      });
      if (!factor?.confirmedAt)
        throw new PortalError(
          403,
          "Confirm your admin authenticator before changing grants."
        );
      const counter = verifyAuthenticatorCode(
        openAuthenticator(a.actor.id, factor.secretCiphertext),
        input.code,
        factor.lastCounter
      );
      await tx.adminAuthenticator.update({
        where: { userId: a.actor.id },
        data: { lastCounter: counter }
      });
      const revokedAt = input.enabled ? null : new Date();
      const next = isSupport
        ? await tx.supportCapabilityGrant.upsert({
            where: {
              userId_capability: {
                userId: target.id,
                capability: capability as SupportCapability
              }
            },
            create: {
              userId: target.id,
              capability: capability as SupportCapability
            },
            update: { revokedAt, version: { increment: 1 } },
            select: { id: true, version: true }
          })
        : await tx.platformOperatorGrant.upsert({
            where: {
              userId_capability: {
                userId: target.id,
                capability: capability as OperatorCapability
              }
            },
            create: {
              userId: target.id,
              capability: capability as OperatorCapability
            },
            update: { revokedAt, version: { increment: 1 } },
            select: { id: true, version: true }
          });
      if (isSupport) await reconcileSupportAccess(tx);
      const result = {
        id: next.id,
        version: next.version,
        capability,
        enabled: input.enabled,
        reason,
        message: input.enabled
          ? "Explicit capability assigned. No cases, church memberships or intake recipients were assigned."
          : "Capability revoked. Current access is rechecked on every request."
      };
      await recordAdminOperation(
        tx,
        a.actor.id,
        input,
        { sourceType: "ACCESS", sourceId: target.id },
        result,
        next.id
      );
      return result;
    },
    true
  );
}
