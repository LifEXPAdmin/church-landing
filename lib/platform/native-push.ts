import { createHash } from "node:crypto";
import type { Prisma, PrismaClient, PushSubscription } from "@prisma/client";
import { hashSessionToken } from "./auth";
import { withOwnedSession, requireSessionOwner } from "./account-sessions";
import {
  accountSessionIsActive,
  activeAccountSessionWhere,
  inactiveAccountSessionWhere
} from "./account-session-policy";
import { AccountError } from "./account-error";
import { PortalError } from "./portal-policy";
import { socialCommand } from "./social-operations";
import {
  requireNotificationActor,
  revokePushSubscriptions
} from "./push-subscriptions";
import { nativePushConfig } from "./native-push-config";
import {
  nativePushPrepareInput,
  nativePushRegisterInput,
  nativePushRevokeInput,
  nativePushDevice,
  nativePushRegistered,
  nativePushRevoked
} from "./native-push-contracts";

type Tx = Prisma.TransactionClient;
const conflict = () =>
  new PortalError(
    409,
    "This device registration changed. Review its current state before creating a new request."
  );
export const nativeInstallationHash = (secret: string) =>
  createHash("sha256")
    .update(JSON.stringify(["native-push-installation-v1", secret]))
    .digest("hex");
const tokenHash = (project: string, token: string) =>
  createHash("sha256")
    .update(JSON.stringify(["EXPO", project, token]))
    .digest("hex");
function descriptor(row: PushSubscription, sessionId: string) {
  return nativePushDevice.parse({
    id: row.id,
    version: row.version,
    provider: row.provider,
    platform: row.nativePlatform,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    isCurrentSession: row.sessionId === sessionId
  });
}
async function recovery(tx: Tx) {
  const row = await tx.nativePushRecovery.findUnique({
    where: { id: "current" }
  });
  if (!row)
    throw new PortalError(503, "Device registration needs a recovery review.");
  return row.epoch;
}
const active = (now: Date) => ({
  revokedAt: null,
  expiresAt: { gt: now },
  session: { is: activeAccountSessionWhere(now) }
});

/** Preparation reads an opaque installation generation, never prior ownership. */
export function prepareNativePush(
  db: PrismaClient,
  token: string,
  owner: string,
  value: unknown
) {
  const input = nativePushPrepareInput.parse(value);
  return withOwnedSession(
    db,
    token,
    async (tx, session) => {
      requireSessionOwner(session, owner);
      await requireNotificationActor(tx, owner);
      const hash = nativeInstallationHash(input.installationSecret);
      const recoveryEpoch = await recovery(tx);
      const fence = await tx.nativePushInstallation.findUnique({
        where: { id: hash }
      });
      const row = await tx.pushSubscription.findFirst({
        where: {
          ownerId: owner,
          provider: "EXPO",
          installationHash: hash,
          installationVersion: fence?.version ?? 0,
          nativeRecoveryEpoch: recoveryEpoch,
          ...active(new Date())
        }
      });
      const config = nativePushConfig();
      return {
        recoveryEpoch,
        installationVersion: fence?.version ?? 0,
        available: config !== null,
        projectId: config?.projectId ?? null,
        association: row ? descriptor(row, session.id) : null
      };
    },
    "shared"
  );
}

export function listNativePushDevices(
  db: PrismaClient,
  token: string,
  owner: string
) {
  return withOwnedSession(
    db,
    token,
    async (tx, session) => {
      requireSessionOwner(session, owner);
      const epoch = await recovery(tx);
      const rows = await tx.pushSubscription.findMany({
        where: {
          ownerId: owner,
          ...active(new Date()),
          OR: [
            { provider: "WEB_PUSH" },
            { provider: "EXPO", nativeRecoveryEpoch: epoch }
          ]
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 8
      });
      return { devices: rows.map((row) => descriptor(row, session.id)) };
    },
    "shared"
  );
}

export async function registerNativePush(
  db: PrismaClient,
  token: string,
  owner: string,
  value: unknown
) {
  const input = nativePushRegisterInput.parse(value);
  const hash = nativeInstallationHash(input.installationSecret);
  let currentSession: { id: string; expiresAt: Date } | null = null;
  let projectId = "";
  const result = await socialCommand(
    db,
    token,
    "native-push-register",
    input,
    async (tx) => {
      if (!currentSession) throw new AccountError("session");
      const endpointHash = tokenHash(projectId, input.token);
      // Session deletion uses session -> subscription -> fence -> delivery locks.
      // NOWAIT also avoids inversions against legacy bulk session deletions.
      await tx.$queryRaw`SELECT id FROM "PushSubscription" WHERE "revokedAt" IS NULL AND
      ("ownerId"=${owner} OR "installationHash"=${hash} OR "endpointHash"=${endpointHash}) ORDER BY id FOR UPDATE NOWAIT`;
      if (
        await tx.pushSubscription.findUnique({
          where: { id: input.id },
          select: { id: true }
        })
      )
        throw conflict();
      const endpointOwner = await tx.pushSubscription.findUnique({
        where: { endpointHash }
      });
      if (endpointOwner && endpointOwner.installationHash !== hash)
        throw conflict();
      if (input.expectedInstallationVersion === 0) {
        if (await tx.nativePushInstallation.findUnique({ where: { id: hash } }))
          throw conflict();
        await tx.nativePushInstallation.create({
          data: { id: hash, version: 1 }
        });
      } else {
        const advanced = await tx.nativePushInstallation.updateMany({
          where: { id: hash, version: input.expectedInstallationVersion },
          data: { version: { increment: 1 } }
        });
        if (advanced.count !== 1) throw conflict();
      }
      await revokePushSubscriptions(tx, { installationHash: hash });
      const now = new Date();
      await revokePushSubscriptions(
        tx,
        {
          ownerId: owner,
          OR: [
            { expiresAt: { lte: now } },
            { session: { is: null } },
            { session: { is: inactiveAccountSessionWhere(now) } }
          ]
        },
        now
      );
      if (
        (await tx.pushSubscription.count({
          where: { ownerId: owner, revokedAt: null }
        })) >= 8
      )
        throw new PortalError(
          409,
          "Remove an older notification device before enabling another."
        );
      // Recheck the idle deadline after any database wait without extending it.
      const current = await tx.platformSession.findUnique({
        where: { id: currentSession.id }
      });
      if (!current || !accountSessionIsActive(current, new Date()))
        throw new AccountError("session");
      await tx.pushSubscription.create({
        data: {
          id: input.id,
          ownerId: owner,
          sessionId: currentSession.id,
          provider: "EXPO",
          nativeToken: input.token,
          nativePlatform: input.platform,
          nativeProjectId: projectId,
          nativeRecoveryEpoch: input.recoveryEpoch,
          installationHash: hash,
          installationVersion: input.expectedInstallationVersion + 1,
          bindingHash: hash,
          endpointHash,
          label: input.label,
          expiresAt: current.expiresAt
        }
      });
      return {
        id: input.id,
        version: 1,
        installationVersion: input.expectedInstallationVersion + 1,
        recoveryEpoch: input.recoveryEpoch,
        message: "Phone notifications enabled for this device."
      };
    },
    async (tx, ownerId) => {
      requireSessionOwner({ userId: ownerId }, owner);
      await requireNotificationActor(tx, ownerId);
      const config = nativePushConfig();
      if (!config)
        throw new PortalError(
          503,
          "Phone notifications are not available yet."
        );
      projectId = config.projectId;
      if ((await recovery(tx)) !== input.recoveryEpoch) throw conflict();
      const sessionHash = hashSessionToken(token);
      await tx.$queryRaw`SELECT id FROM "PlatformSession" WHERE "tokenHash"=${sessionHash} FOR KEY SHARE NOWAIT`;
      const session = await tx.platformSession.findUnique({
        where: { tokenHash: sessionHash }
      });
      if (
        !session ||
        session.userId !== owner ||
        !accountSessionIsActive(session)
      )
        throw new AccountError("session");
      currentSession = session;
      const prior = await tx.socialOperation.findUnique({
        where: {
          ownerId_key: {
            ownerId,
            key: `native-push-register:${input.mutationId}`
          }
        },
        select: { key: true }
      });
      if (prior) {
        const fence = await tx.nativePushInstallation.findUnique({
          where: { id: hash }
        });
        if (fence?.version !== input.expectedInstallationVersion + 1)
          throw conflict();
        if (
          !(await tx.pushSubscription.findFirst({
            where: {
              id: input.id,
              ownerId,
              sessionId: session.id,
              provider: "EXPO",
              nativeProjectId: projectId,
              nativeRecoveryEpoch: input.recoveryEpoch,
              installationHash: hash,
              installationVersion: fence.version,
              ...active(new Date())
            },
            select: { id: true }
          }))
        )
          throw conflict();
      }
    }
  );
  return nativePushRegistered.parse(result);
}

/** Historical removal receipts remain valid; they cannot remove a replacement. */
export async function revokeNativePush(
  db: PrismaClient,
  token: string,
  owner: string,
  value: unknown
) {
  const input = nativePushRevokeInput.parse(value);
  const result = await socialCommand(
    db,
    token,
    "native-push-revoke",
    input,
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PushSubscription" WHERE id=${input.id} AND "ownerId"=${owner} FOR UPDATE NOWAIT`;
      const row = await tx.pushSubscription.findFirst({
        where: { id: input.id, ownerId: owner }
      });
      if (!row) throw new PortalError(404, "This device is unavailable.");
      if (row.revokedAt || row.version !== input.expectedVersion)
        throw conflict();
      await revokePushSubscriptions(tx, { id: row.id });
      return {
        id: row.id,
        version: row.version + 1,
        removed: true,
        message: "Phone notifications removed for this device."
      };
    },
    async (_tx, ownerId) => {
      requireSessionOwner({ userId: ownerId }, owner);
    }
  );
  return nativePushRevoked.parse(result);
}
