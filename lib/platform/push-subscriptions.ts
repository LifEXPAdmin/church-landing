import { createHash, ECDH } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import { hashSessionToken, validToken } from "./auth";
import { eligibleWhere, expected, PortalError } from "./portal-policy";
import { postField, postId } from "./post-input";
import { socialCommand, socialInput } from "./social-operations";
import { pushAvailable, pushServerConfig } from "./push-config";

type Tx = Prisma.TransactionClient;
export async function requireNotificationActor(tx: Tx, ownerId: string) {
  if (
    !(await tx.platformUser.findFirst({
      where: { id: ownerId, ...eligibleWhere },
      select: { id: true }
    }))
  )
    throw new PortalError(
      403,
      "Verify your email and complete adult account setup before using phone notifications."
    );
}
// Supported browser-owned delivery services only. No credentials, redirects to
// arbitrary hosts, local addresses or general URL fetching from user input.
export function parsePushSubscription(value: unknown) {
  const v = value as Record<string, unknown> | null;
  const keys = v?.keys as Record<string, unknown> | undefined;
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some(
      (k) => !["endpoint", "keys", "expirationTime"].includes(k)
    ) ||
    typeof v.endpoint !== "string" ||
    v.endpoint.length > 2048 ||
    !keys ||
    Object.keys(keys).sort().join() !== "auth,p256dh" ||
    typeof keys.p256dh !== "string" ||
    !/^[\w-]{87}$/.test(keys.p256dh) ||
    typeof keys.auth !== "string" ||
    !/^[\w-]{22}$/.test(keys.auth)
  )
    throw new PortalError(
      400,
      "This browser supplied an unsupported notification subscription."
    );
  let endpoint: URL;
  try {
    endpoint = new URL(v.endpoint);
  } catch {
    throw new PortalError(400, "This notification endpoint is invalid.");
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.port ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hash ||
    ![
      "fcm.googleapis.com",
      "web.push.apple.com",
      "updates.push.services.mozilla.com"
    ].includes(endpoint.hostname) ||
    endpoint.pathname.length < 2
  )
    throw new PortalError(
      400,
      "This browser's notification provider is not supported."
    );
  try {
    if (
      ECDH.convertKey(Buffer.from(keys.p256dh, "base64url"), "prime256v1")
        .length !== 65 ||
      Buffer.from(keys.auth, "base64url").length !== 16 ||
      Buffer.from(keys.auth, "base64url").toString("base64url") !== keys.auth ||
      Buffer.from(keys.p256dh, "base64url").toString("base64url") !==
        keys.p256dh
    )
      throw Error();
  } catch {
    throw new PortalError(
      400,
      "This browser supplied invalid notification keys."
    );
  }
  const expiry = v.expirationTime;
  if (
    expiry != null &&
    (typeof expiry !== "number" ||
      !Number.isSafeInteger(expiry) ||
      expiry > 8640000000000000 ||
      expiry <= Date.now())
  )
    throw new PortalError(
      400,
      "This notification subscription has expired. Enable it again."
    );
  return {
    endpoint: endpoint.href,
    p256dh: keys.p256dh,
    auth: keys.auth,
    expiresAt: typeof expiry === "number" ? new Date(expiry) : null
  };
}
export function revokePushSubscriptions(
  tx: Tx,
  where: Prisma.PushSubscriptionWhereInput,
  now = new Date()
) {
  return tx.pushSubscription.updateMany({
    where: { AND: [where, { revokedAt: null }] },
    data: {
      revokedAt: now,
      bindingHash: null,
      endpointHash: null,
      endpoint: null,
      p256dh: null,
      auth: null,
      label: "Removed device",
      version: { increment: 1 }
    }
  });
}
const publicDevice = {
  id: true,
  label: true,
  version: true,
  createdAt: true,
  expiresAt: true
} satisfies Prisma.PushSubscriptionSelect;
export function readPushSubscriptions(db: PrismaClient, token: unknown) {
  return withOwnedSession(
    db,
    token,
    async (tx, session) => {
      await requireNotificationActor(tx, session.userId);
      await revokePushSubscriptions(tx, {
        ownerId: session.userId,
        expiresAt: { lte: new Date() }
      });
      return {
        ownerId: session.userId,
        publicKey: pushServerConfig()?.publicKey ?? null,
        devices: await tx.pushSubscription.findMany({
          where: { ownerId: session.userId, revokedAt: null },
          select: publicDevice,
          orderBy: { createdAt: "desc" },
          take: 8
        })
      };
    },
    true
  );
}
export async function pushSubscriptionCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "operation",
    "mutationId",
    "ownerId",
    "binding",
    "subscription",
    "label",
    "id",
    "expectedVersion"
  ]);
  if (!["subscribe", "unsubscribe"].includes(String(input.operation)))
    throw new PortalError(400, "Choose a supported device action.");
  const result = await socialCommand(
    db,
    token,
    "notification-device",
    input,
    async (tx, ownerId) => {
      if (input.operation === "unsubscribe") {
        const row = await tx.pushSubscription.findFirst({
          where: { id: postId(input.id), ownerId }
        });
        if (!row) throw new PortalError(404, "This device is unavailable.");
        expected(input.expectedVersion, row.version);
        await revokePushSubscriptions(tx, { id: row.id });
        return {
          id: row.id,
          version: row.version + (row.revokedAt ? 0 : 1),
          message: "Phone notifications removed for this device."
        };
      }
      if (!pushAvailable())
        throw new PortalError(
          503,
          "Phone notifications are not available yet."
        );
      if (!validToken(input.binding))
        throw new PortalError(
          400,
          "Enable notifications from this browser again."
        );
      const subscription = parsePushSubscription(input.subscription);
      const session = await tx.platformSession.findUniqueOrThrow({
        where: { tokenHash: hashSessionToken(token as string) }
      });
      const bindingHash = hashSessionToken(input.binding);
      const endpointHash = createHash("sha256")
        .update(subscription.endpoint)
        .digest("hex");
      const label = postField(input.label, 80, 1);
      const expiresAt = new Date(
        Math.min(
          session.expiresAt.getTime(),
          subscription.expiresAt?.getTime() ?? Infinity
        )
      );
      const prior = await tx.pushSubscription.findFirst({
        where: { bindingHash }
      });
      const endpointOwner = await tx.pushSubscription.findUnique({
        where: { endpointHash }
      });
      if (
        endpointOwner &&
        (endpointOwner.p256dh !== subscription.p256dh ||
          endpointOwner.auth !== subscription.auth)
      )
        throw new PortalError(
          409,
          "This subscription changed. Remove it in this browser and enable a new subscription."
        );
      if (
        prior &&
        prior.ownerId === ownerId &&
        prior.sessionId === session.id &&
        prior.endpoint === subscription.endpoint &&
        prior.p256dh === subscription.p256dh &&
        prior.auth === subscription.auth
      ) {
        const saved = await tx.pushSubscription.update({
          where: { id: prior.id },
          data: { label, expiresAt }
        });
        return {
          id: saved.id,
          version: saved.version,
          message: "Phone notifications enabled for this browser."
        };
      }
      // Possession of the browser's secret binding and subscription keys permits
      // replacing its association, never reading the previous account's metadata.
      await revokePushSubscriptions(tx, {
        OR: [{ bindingHash }, { endpointHash }]
      });
      await revokePushSubscriptions(tx, {
        ownerId,
        expiresAt: { lte: new Date() }
      });
      if (
        (await tx.pushSubscription.count({
          where: { ownerId, revokedAt: null }
        })) >= 8
      )
        throw new PortalError(
          409,
          "Remove an older notification device before enabling another."
        );
      const saved = await tx.pushSubscription.create({
        data: {
          ownerId,
          sessionId: session.id,
          bindingHash,
          endpointHash,
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          label,
          expiresAt
        }
      });
      return {
        id: saved.id,
        version: saved.version,
        message: "Phone notifications enabled for this browser."
      };
    },
    async (tx, ownerId) => {
      if (input.ownerId !== ownerId)
        throw new PortalError(
          401,
          "Your sign-in changed. Reload before changing notifications."
        );
      await requireNotificationActor(tx, ownerId);
    }
  );
  if (input.operation === "subscribe") {
    await withOwnedSession(db, token, async (tx, session) => {
      if (
        !(await tx.pushSubscription.findFirst({
          where: {
            id: result.id,
            ownerId: session.userId,
            sessionId: session.id,
            revokedAt: null,
            expiresAt: { gt: new Date() }
          },
          select: { id: true }
        }))
      )
        throw new PortalError(
          409,
          "This device association ended. Enable again with a fresh request."
        );
    });
  }
  return result;
}
