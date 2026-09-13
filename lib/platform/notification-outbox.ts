import type { Prisma, PrismaClient, SocialEvent } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { withOwnedSession } from "./account-sessions";
import { PortalError } from "./portal-policy";
import { postId } from "./post-input";
import { pushAvailable } from "./push-config";
import {
  notificationPreferencesIn,
  quietHoursEnd
} from "./notification-preferences";
import { notificationSource } from "./notification-source";
import { revokePushSubscriptions } from "./push-subscriptions";
type Tx = Prisma.TransactionClient;
export const NOTIFICATION_PREVIEW = "You have a new message on God’s Churches.";
const DAY = 86400000;
export function notificationWrite<T>(
  db: PrismaClient,
  work: (tx: Tx) => Promise<T>
) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      return work(tx);
    },
    { maxWait: 10000, timeout: 15000 }
  );
}
export async function enqueueNotification(
  tx: Tx,
  event: SocialEvent,
  onlyDeviceId?: string
) {
  if (!pushAvailable() || !event.recipientId) return;
  const now = new Date();
  const devices = await tx.pushSubscription.findMany({
    where: {
      ownerId: event.recipientId,
      revokedAt: null,
      expiresAt: { gt: now },
      ...(onlyDeviceId ? { id: onlyDeviceId } : {})
    },
    select: { id: true, version: true },
    take: 8
  });
  if (!devices.length) return;
  const source = await notificationSource(tx, event, true, now);
  if (!source) return;
  const preferences = await notificationPreferencesIn(tx, event.recipientId);
  if (
    source.category !== "test" &&
    ((source.category === "founder" && !preferences.inApp.founder) ||
      !preferences.pushCategories.includes(source.category))
  )
    return;
  const expiresAt = new Date(
    Math.min(
      event.createdAt.getTime() +
        (source.category === "test" ? 600000 : 7 * DAY),
      now.getTime() + 7 * DAY
    )
  );
  if (expiresAt <= now) return;
  const availableAt = quietHoursEnd(preferences.quietHours, now) ?? now;
  await tx.notificationDelivery.createMany({
    data: devices.map((device) => ({
      id: randomUUID(),
      eventId: event.id,
      ownerId: event.recipientId!,
      subscriptionId: device.id,
      subscriptionVersion: device.version,
      availableAt,
      expiresAt,
      ...(availableAt >= expiresAt ? terminal(now, "CANCELLED") : {})
    })),
    skipDuplicates: true
  });
}
const terminal = (now: Date, outcome: "CANCELLED" | "ACCEPTED" | "FAILED") => ({
  state: "FINISHED" as const,
  outcome,
  finishedAt: now,
  leaseToken: null,
  leaseUntil: null
});
export type PushTransport = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { deliveryId: string; tag: string },
  ttl: number
) => Promise<number>;
export type PushWorkResult =
  | { done: true; outcome: "accepted" | "cancelled" | "failed" | "finished" }
  | { done: false; afterSeconds: number };
// Leasing precedes the bounded external call. A later revocation cancels the
// durable row and prevents retry; an already submitted generic push is not recallable.
export async function deliverNotification(
  db: PrismaClient,
  id: string,
  transport: PushTransport,
  now = new Date()
): Promise<PushWorkResult> {
  const claim = await notificationWrite(db, async (tx) => {
    const row = await tx.notificationDelivery.findUnique({
      where: { id },
      include: {
        event: true,
        subscription: {
          include: {
            session: { select: { credentialVersion: true, expiresAt: true } },
            owner: { select: { credentialVersion: true } }
          }
        }
      }
    });
    if (!row || row.state === "FINISHED")
      return { done: true, outcome: "finished" } as const;
    const sub = row.subscription;
    if (sub.expiresAt <= now && !sub.revokedAt)
      await revokePushSubscriptions(tx, { id: sub.id }, now);
    const finish = async (outcome: "CANCELLED" | "FAILED") => {
      await tx.notificationDelivery.update({
        where: { id },
        data: terminal(now, outcome)
      });
      return {
        done: true,
        outcome: outcome === "FAILED" ? "failed" : "cancelled"
      } as const;
    };
    if (
      !pushAvailable() ||
      row.expiresAt <= now ||
      sub.revokedAt ||
      sub.expiresAt <= now ||
      sub.version !== row.subscriptionVersion ||
      !sub.session ||
      sub.session.expiresAt <= now ||
      sub.session.credentialVersion !== sub.owner.credentialVersion ||
      !sub.endpoint ||
      !sub.p256dh ||
      !sub.auth
    )
      return finish("CANCELLED");
    if (row.state === "IN_FLIGHT" && row.leaseUntil! > now)
      return {
        done: false,
        afterSeconds: Math.max(
          1,
          Math.ceil((row.leaseUntil!.getTime() - now.getTime()) / 1000)
        )
      } as const;
    const source = await notificationSource(tx, row.event, true, now);
    if (!source) return finish("CANCELLED");
    const preferences = await notificationPreferencesIn(tx, row.ownerId);
    if (
      source.category !== "test" &&
      ((source.category === "founder" && !preferences.inApp.founder) ||
        !preferences.pushCategories.includes(source.category))
    )
      return finish("CANCELLED");
    const availableAt =
      quietHoursEnd(preferences.quietHours, now) ?? row.availableAt;
    if (availableAt > now) {
      await tx.notificationDelivery.update({
        where: { id },
        data: {
          state: "QUEUED",
          availableAt,
          leaseToken: null,
          leaseUntil: null
        }
      });
      return {
        done: false,
        afterSeconds: Math.max(
          1,
          Math.ceil((availableAt.getTime() - now.getTime()) / 1000)
        )
      } as const;
    }
    if (row.attempts >= 8) return finish("FAILED");
    const attempt = row.attempts + 1,
      leaseToken = randomUUID();
    await tx.notificationDelivery.update({
      where: { id },
      data: {
        state: "IN_FLIGHT",
        attempts: attempt,
        leaseToken,
        leaseUntil: new Date(now.getTime() + 60000)
      }
    });
    await tx.pushDeliveryAttempt.create({
      data: { deliveryId: id, attempt, outcome: "ATTEMPTED", createdAt: now }
    });
    return {
      subscription: {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      },
      subscriptionId: sub.id,
      payload: { deliveryId: id, tag: source.group },
      ttl: Math.max(
        0,
        Math.min(
          300,
          Math.floor((row.expiresAt.getTime() - now.getTime()) / 1000)
        )
      ),
      attempt,
      leaseToken
    };
  });
  if (claim.done !== undefined) return claim;
  let status = 0;
  try {
    status = await transport(claim.subscription, claim.payload, claim.ttl);
  } catch {
    /* Diagnostics must not retain a provider exception with endpoint/key material. */
  }
  const finished = new Date(Math.max(Date.now(), now.getTime()));
  return notificationWrite(db, async (tx) => {
    const row = await tx.notificationDelivery.findFirst({
      where: { id, state: "IN_FLIGHT", leaseToken: claim.leaseToken }
    });
    if (!row) return { done: true, outcome: "cancelled" };
    const accepted = status >= 200 && status < 300,
      expired = status === 404 || status === 410;
    const retry =
      !accepted &&
      !expired &&
      (status === 0 || status === 408 || status === 429 || status >= 500) &&
      claim.attempt < 8 &&
      row.expiresAt > finished;
    await tx.pushDeliveryAttempt.update({
      where: { deliveryId_attempt: { deliveryId: id, attempt: claim.attempt } },
      data: {
        outcome: accepted
          ? "ACCEPTED"
          : expired
            ? "EXPIRED"
            : retry
              ? "RETRY"
              : "FAILED",
        statusCode: status >= 100 && status <= 599 ? status : null
      }
    });
    if (expired)
      await revokePushSubscriptions(tx, { id: claim.subscriptionId }, finished);
    if (retry) {
      const afterSeconds = Math.min(3600, 30 * 2 ** (claim.attempt - 1));
      await tx.notificationDelivery.update({
        where: { id },
        data: {
          state: "QUEUED",
          availableAt: new Date(finished.getTime() + afterSeconds * 1000),
          leaseToken: null,
          leaseUntil: null
        }
      });
      return { done: false, afterSeconds };
    }
    if (!expired)
      await tx.notificationDelivery.update({
        where: { id },
        data: terminal(finished, accepted ? "ACCEPTED" : "FAILED")
      });
    return {
      done: true,
      outcome: accepted ? "accepted" : expired ? "cancelled" : "failed"
    };
  });
}
export function openNotification(
  db: PrismaClient,
  token: unknown,
  id: unknown,
  requireDevice = true
) {
  return withOwnedSession(
    db,
    token,
    async (tx, session) => {
      const row = await tx.notificationDelivery.findFirst({
        where: {
          id: postId(id),
          ownerId: session.userId,
          ...(requireDevice
            ? {
                subscription: {
                  sessionId: session.id,
                  revokedAt: null,
                  expiresAt: { gt: new Date() }
                }
              }
            : {})
        },
        include: { event: true }
      });
      const source = row && (await notificationSource(tx, row.event, false));
      if (!source)
        throw new PortalError(
          404,
          "This notification is no longer available for this sign-in."
        );
      return {
        href: source.href,
        preview: NOTIFICATION_PREVIEW,
        tag: source.group
      };
    },
    true
  );
}
// Keep source-lived terminal guards; remove only content-free attempt diagnostics.
export async function cleanNotificationRecords(tx: Tx, now = new Date()) {
  const revoked = await revokePushSubscriptions(
    tx,
    { expiresAt: { lte: now } },
    now
  );
  await tx.notificationDelivery.updateMany({
    where: { state: { not: "FINISHED" }, expiresAt: { lte: now } },
    data: terminal(now, "CANCELLED")
  });
  const cutoff = new Date(now.getTime() - 14 * DAY);
  const attempts = await tx.pushDeliveryAttempt.deleteMany({
    where: { delivery: { state: "FINISHED", finishedAt: { lte: cutoff } } }
  });
  const summaries = await tx.notificationDelivery.updateMany({
    where: {
      state: "FINISHED",
      finishedAt: { lte: cutoff },
      OR: [{ outcome: { not: null } }, { attempts: { gt: 0 } }]
    },
    data: { outcome: null, attempts: 0, dispatchedAt: null }
  });
  await tx.socialEvent.deleteMany({
    where: {
      kind: "PUSH_TEST",
      createdAt: { lte: new Date(now.getTime() - 15 * DAY) }
    }
  });
  return {
    revoked: revoked.count,
    diagnostics: attempts.count,
    summaries: summaries.count
  };
}
