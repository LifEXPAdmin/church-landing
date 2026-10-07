import {
  socialEmailAvailable,
  socialEmailCategory,
  sendSocialEmail,
  type SocialEmailTransport
} from "./social-email";
import {
  feedbackEmailAvailable,
  sendFeedbackEmail,
  type FeedbackEmailTransport
} from "./feedback-email";
import type { Prisma, PrismaClient, SocialEvent } from "@prisma/client";
import { randomUUID, createHash } from "node:crypto";
import { withOwnedSession, requireSessionOwner } from "./account-sessions";
import { PortalError } from "./portal-policy";
import { postId } from "./post-input";
import { pushAvailable } from "./push-config";
import { nativePushAvailable, nativePushConfig } from "./native-push-config";
import {
  nativePushTransport,
  type NativePushTransport,
  type NativePushSendResult,
  type NativePushReceiptResult
} from "./native-push-provider";
import {
  projectNotificationPreferences,
  notificationPushAllowed,
  notificationEmailAllowed,
  quietHoursEnd
} from "./notification-preferences";
import { notificationSource } from "./notification-source";
import { revokePushSubscriptions } from "./push-subscriptions";
import {
  accountSessionDeadline,
  accountSessionIsActive,
  activeAccountSessionWhere,
  inactiveAccountSessionWhere
} from "./account-session-policy";
type Tx = Prisma.TransactionClient;
export const NOTIFICATION_PREVIEW = "You have new activity on God’s Churches.";
const DAY = 86400000;
export const notificationGroupTag = (ownerId: string, group: string) =>
  createHash("sha256")
    .update(JSON.stringify([ownerId, group]))
    .digest("hex");
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
  onlyDeviceId?: string,
  sourceCreatedAt?: Date
) {
  if (!event.recipientId) return;
  const emailCategory =
    socialEmailCategory(event) ??
    (["FEEDBACK_CASE", "FEEDBACK_IDEA"].includes(event.kind)
      ? "feedback"
      : null);
  if (
    !onlyDeviceId &&
    emailCategory &&
    (emailCategory === "feedback"
      ? feedbackEmailAvailable()
      : socialEmailAvailable())
  ) {
    const at = new Date();
    const settings = await tx.socialPreferences.findUnique({
      where: { ownerId: event.recipientId }
    });
    // Most recipients have not opted in. Check their dated choice before the
    // canonical source reads; opted-in deliveries still need all authority checks.
    const source = notificationEmailAllowed(
      settings,
      sourceCreatedAt ?? event.createdAt,
      emailCategory
    )
      ? await notificationSource(tx, event, "EMAIL", at)
      : null;
    const owner =
      source && source.category === emailCategory
        ? await tx.platformUser.findUnique({
            where: { id: event.recipientId },
            select: { credentialVersion: true }
          })
        : null;
    // Resend retains idempotency keys for 24h. Never retry an optional email
    // beyond 23h from the event, including delayed dispatch and lost responses.
    const expiresAt = new Date(event.createdAt.getTime() + 23 * 3600000);
    const availableAt =
      quietHoursEnd(projectNotificationPreferences(settings).quietHours, at) ??
      at;
    if (owner && expiresAt > at)
      await tx.notificationDelivery.createMany({
        data: [
          {
            id: randomUUID(),
            eventId: event.id,
            ownerId: event.recipientId,
            channel: "EMAIL",
            emailCredentialVersion: owner.credentialVersion,
            availableAt,
            expiresAt,
            ...(availableAt >= expiresAt ? terminal(at, "CANCELLED") : {})
          }
        ],
        skipDuplicates: true
      });
  }
  const providers = [
    ...(pushAvailable() ? ["WEB_PUSH"] : []),
    ...(nativePushAvailable() ? ["EXPO"] : [])
  ];
  if (!providers.length) return;
  const now = new Date();
  const devices = await tx.pushSubscription.findMany({
    where: {
      ownerId: event.recipientId,
      provider: { in: providers },
      revokedAt: null,
      expiresAt: { gt: now },
      session: { is: activeAccountSessionWhere(now) },
      ...(sourceCreatedAt ? { createdAt: { lt: sourceCreatedAt } } : {}),
      ...(onlyDeviceId ? { id: onlyDeviceId } : {})
    },
    select: { id: true, version: true },
    take: 8
  });
  if (!devices.length) return;
  const source = await notificationSource(tx, event, true, now);
  if (!source) return;
  const row = await tx.socialPreferences.findUnique({
    where: { ownerId: event.recipientId }
  });
  const preferences = projectNotificationPreferences(row);
  if (
    source.category !== "test" &&
    ((source.category === "founder" && !preferences.inApp.founder) ||
      !notificationPushAllowed(
        row,
        source.category,
        sourceCreatedAt ?? event.createdAt
      ))
  )
    return;
  const expiresAt = new Date(
    Math.min(
      event.createdAt.getTime() +
        (source.category === "test" ? 600000 : 7 * DAY),
      now.getTime() + 7 * DAY,
      source.expiresAt?.getTime() ?? Infinity
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
  leaseUntil: null,
  nativeTicketId: null,
  nativeTicketCreatedAt: null,
  nativeReceiptChecks: 0
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
  now = new Date(),
  emailTransport: FeedbackEmailTransport = sendFeedbackEmail,
  socialTransport: SocialEmailTransport = sendSocialEmail,
  nativeTransport: NativePushTransport = nativePushTransport
): Promise<PushWorkResult> {
  const claim = await notificationWrite(db, async (tx) => {
    const row = await tx.notificationDelivery.findUnique({
      where: { id },
      include: {
        event: true,
        owner: { select: { credentialVersion: true, email: true } },
        subscription: {
          include: {
            session: {
              select: {
                credentialVersion: true,
                expiresAt: true,
                idleExpiresAt: true
              }
            },
            owner: { select: { credentialVersion: true } }
          }
        }
      }
    });
    // Permission and database reads may wait. Recheck every time-bound source
    // against current time while retaining future test/scheduler clock input.
    now = new Date(Math.max(now.getTime(), Date.now()));
    const sessionNow = now;
    if (!row || row.state === "FINISHED")
      return { done: true, outcome: "finished" } as const;
    const sub = row.subscription;
    const email = row.channel === "EMAIL";
    const native = !email && sub?.provider === "EXPO";
    const nativeConfig = nativePushConfig();
    const nativeEpoch = native
      ? await tx.nativePushRecovery.findUnique({ where: { id: "current" } })
      : null;
    const emailCategory =
      socialEmailCategory(row.event) ??
      (["FEEDBACK_CASE", "FEEDBACK_IDEA"].includes(row.event.kind)
        ? "feedback"
        : null);
    if (
      sub &&
      !sub.revokedAt &&
      (sub.expiresAt <= now ||
        !sub.session ||
        !accountSessionIsActive(sub.session, sessionNow))
    )
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
      row.expiresAt <= now ||
      (email
        ? !emailCategory ||
          !(emailCategory === "feedback"
            ? feedbackEmailAvailable()
            : socialEmailAvailable()) ||
          row.emailCredentialVersion !== row.owner.credentialVersion
        : (native ? !nativeConfig : !pushAvailable()) ||
          !sub ||
          sub.revokedAt ||
          sub.expiresAt <= now ||
          sub.version !== row.subscriptionVersion ||
          !sub.session ||
          !accountSessionIsActive(sub.session, sessionNow) ||
          sub.session.credentialVersion !== sub.owner.credentialVersion ||
          (native
            ? !sub.nativeToken ||
              sub.nativeProjectId !== nativeConfig?.projectId ||
              !nativeEpoch ||
              sub.nativeRecoveryEpoch !== nativeEpoch.epoch
            : sub.provider !== "WEB_PUSH" ||
              !sub.endpoint ||
              !sub.p256dh ||
              !sub.auth))
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
    const source = await notificationSource(
      tx,
      row.event,
      email ? "EMAIL" : true,
      now
    );
    if (!source) return finish("CANCELLED");
    const settings = await tx.socialPreferences.findUnique({
      where: { ownerId: row.ownerId }
    });
    const preferences = projectNotificationPreferences(settings);
    now = new Date(Math.max(now.getTime(), Date.now()));
    const deliveryDeadline = Math.min(
      row.expiresAt.getTime(),
      source.expiresAt?.getTime() ?? Infinity
    );
    if (deliveryDeadline <= now.getTime()) return finish("CANCELLED");
    if (
      email
        ? source.category !== emailCategory ||
          !notificationEmailAllowed(
            settings,
            row.event.createdAt,
            source.category
          )
        : source.category !== "test" &&
          ((source.category === "founder" && !preferences.inApp.founder) ||
            !notificationPushAllowed(
              settings,
              source.category,
              row.event.createdAt
            ))
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
    const polling = native && row.nativeTicketId !== null;
    if (
      polling
        ? row.nativeReceiptChecks >= 100 ||
          !row.nativeTicketCreatedAt ||
          row.nativeTicketCreatedAt.getTime() + DAY <= now.getTime()
        : row.attempts >= 8
    )
      return finish("FAILED");
    const attempt = row.attempts + (polling ? 0 : 1),
      leaseToken = randomUUID();
    await tx.notificationDelivery.update({
      where: { id },
      data: {
        state: "IN_FLIGHT",
        attempts: attempt,
        ...(polling ? { nativeReceiptChecks: { increment: 1 } } : {}),
        leaseToken,
        leaseUntil: new Date(now.getTime() + 60000)
      }
    });
    if (!polling)
      await tx.pushDeliveryAttempt.create({
        data: { deliveryId: id, attempt, outcome: "ATTEMPTED", createdAt: now }
      });
    return {
      nativeIntent:
        native && sub?.nativeToken
          ? { token: sub.nativeToken, ticketId: row.nativeTicketId }
          : null,
      socialIntent:
        email && emailCategory !== "feedback"
          ? { deliveryId: id, email: row.owner.email }
          : null,
      emailIntent:
        email && emailCategory === "feedback"
          ? {
              deliveryId: id,
              email: row.owner.email,
              kind: row.event.kind as "FEEDBACK_CASE" | "FEEDBACK_IDEA",
              sourceId: row.event.sourceId!
            }
          : null,
      subscription:
        sub && sub.endpoint && sub.p256dh && sub.auth
          ? {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth }
            }
          : null,
      subscriptionId: sub?.id ?? null,
      deliveryDeadline,
      sessionDeadline:
        !email && sub?.session
          ? accountSessionDeadline(sub.session).getTime()
          : null,
      payload: {
        deliveryId: id,
        tag: notificationGroupTag(row.ownerId, source.group)
      },
      ttl: Math.max(
        0,
        Math.min(
          300,
          Math.floor((deliveryDeadline - now.getTime()) / 1000),
          !email && sub?.session
            ? Math.floor(
                (accountSessionDeadline(sub.session).getTime() -
                  sessionNow.getTime()) /
                  1000
              )
            : 300
        )
      ),
      attempt,
      leaseToken
    };
  });
  if (claim.done !== undefined) return claim;
  // Admission may precede expiry while its transaction/commit finishes. An
  // already-expired browser session must not submit even a zero-TTL push.
  // Email remains account-owned and has its separate durable lifetime.
  const dispatchNow = Math.max(Date.now(), now.getTime());
  const remainingSessionSeconds =
    claim.sessionDeadline == null
      ? null
      : Math.floor((claim.sessionDeadline - dispatchNow) / 1000);
  const idleBeforeDispatch =
    remainingSessionSeconds != null && remainingSessionSeconds <= 0;
  const ttl = Math.min(
    claim.ttl,
    remainingSessionSeconds ?? claim.ttl,
    Math.floor((claim.deliveryDeadline - dispatchNow) / 1000)
  );
  const expiredBeforeDispatch =
    claim.deliveryDeadline <= dispatchNow ||
    (!!claim.subscriptionId && ttl <= 0);
  const skipProvider = idleBeforeDispatch || expiredBeforeDispatch;
  let status = 0;
  let nativeResult: NativePushSendResult | NativePushReceiptResult | null =
    null;
  try {
    if (claim.nativeIntent && !skipProvider) {
      nativeResult = claim.nativeIntent.ticketId
        ? await nativeTransport.receipt(claim.nativeIntent.ticketId)
        : await nativeTransport.send(
            claim.nativeIntent.token,
            claim.payload,
            ttl
          );
    } else
      status = skipProvider
        ? 0
        : claim.socialIntent
          ? await socialTransport(claim.socialIntent)
          : claim.emailIntent
            ? await emailTransport(claim.emailIntent)
            : claim.subscription
              ? await transport(claim.subscription, claim.payload, ttl)
              : 400;
  } catch {
    /* Diagnostics must not retain a provider exception with endpoint/key material. */
  }
  const finished = new Date(Math.max(Date.now(), now.getTime()));
  return notificationWrite(db, async (tx) => {
    if (claim.nativeIntent && claim.subscriptionId)
      await tx.$queryRaw`SELECT id FROM "PushSubscription" WHERE id=${claim.subscriptionId} FOR UPDATE NOWAIT`;
    const row = await tx.notificationDelivery.findFirst({
      where: { id, state: "IN_FLIGHT", leaseToken: claim.leaseToken }
    });
    if (!row) return { done: true, outcome: "cancelled" };
    if (claim.nativeIntent) {
      // A lease captures one immutable association and provider ticket. A stale
      // callback cannot settle a replacement device or another receipt poll.
      if (row.nativeTicketId !== claim.nativeIntent.ticketId)
        return { done: true, outcome: "cancelled" };
      const result = nativeResult ?? {
        kind: "retry" as const,
        statusCode: null
      };
      const inactive =
        skipProvider || claim.deliveryDeadline <= finished.getTime();
      const invalid = result.kind === "invalid";
      const accepted = result.kind === "accepted" && !inactive;
      const polling = claim.nativeIntent.ticketId !== null;
      const ticketId =
        result.kind === "ticket" ? result.ticketId : row.nativeTicketId;
      const ticketCreatedAt =
        result.kind === "ticket" ? finished : row.nativeTicketCreatedAt;
      const pollAgain =
        !inactive &&
        ticketId !== null &&
        (result.kind === "ticket" ||
          result.kind === "pending" ||
          (polling && result.kind === "retry"));
      const resend =
        !inactive &&
        !pollAgain &&
        claim.attempt < 8 &&
        ((!polling && result.kind === "retry") ||
          result.kind === "retry-delivery");
      const deadline = Math.min(
        row.expiresAt.getTime(),
        claim.deliveryDeadline,
        claim.sessionDeadline ?? Infinity,
        ticketCreatedAt ? ticketCreatedAt.getTime() + DAY : Infinity
      );
      const afterSeconds = pollAgain
        ? Math.min(900, Math.floor((deadline - finished.getTime()) / 2000))
        : Math.min(3600, 30 * 2 ** (claim.attempt - 1));
      const retry =
        (pollAgain || resend) &&
        afterSeconds >= 1 &&
        finished.getTime() + afterSeconds * 1000 < deadline &&
        (!pollAgain || row.nativeReceiptChecks < 100);
      await tx.pushDeliveryAttempt.update({
        where: {
          deliveryId_attempt: { deliveryId: id, attempt: claim.attempt }
        },
        data: {
          outcome:
            inactive || invalid
              ? "EXPIRED"
              : accepted
                ? "ACCEPTED"
                : retry
                  ? pollAgain
                    ? "ATTEMPTED"
                    : "RETRY"
                  : "FAILED",
          statusCode: result.statusCode
        }
      });
      if ((invalid || idleBeforeDispatch) && claim.subscriptionId)
        await revokePushSubscriptions(
          tx,
          { id: claim.subscriptionId },
          finished
        );
      if (retry) {
        await tx.notificationDelivery.update({
          where: { id },
          data: {
            state: "QUEUED",
            availableAt: new Date(finished.getTime() + afterSeconds * 1000),
            leaseToken: null,
            leaseUntil: null,
            dispatchedAt: null,
            nativeTicketId: pollAgain ? ticketId : null,
            nativeTicketCreatedAt: pollAgain ? ticketCreatedAt : null,
            nativeReceiptChecks: pollAgain ? row.nativeReceiptChecks : 0
          }
        });
        return { done: false, afterSeconds };
      }
      await tx.notificationDelivery.update({
        where: { id },
        data: terminal(
          finished,
          inactive || invalid ? "CANCELLED" : accepted ? "ACCEPTED" : "FAILED"
        )
      });
      return {
        done: true,
        outcome:
          inactive || invalid ? "cancelled" : accepted ? "accepted" : "failed"
      };
    }
    const accepted = status >= 200 && status < 300,
      expired =
        !claim.socialIntent &&
        !claim.emailIntent &&
        (status === 404 || status === 410);
    const retry =
      !skipProvider &&
      !accepted &&
      !expired &&
      (status === 0 || status === 408 || status === 429 || status >= 500) &&
      claim.attempt < 8 &&
      row.expiresAt > finished;
    await tx.pushDeliveryAttempt.update({
      where: { deliveryId_attempt: { deliveryId: id, attempt: claim.attempt } },
      data: {
        outcome: skipProvider
          ? "EXPIRED"
          : accepted
            ? "ACCEPTED"
            : expired
              ? "EXPIRED"
              : retry
                ? "RETRY"
                : "FAILED",
        statusCode: status >= 100 && status <= 599 ? status : null
      }
    });
    if ((expired || idleBeforeDispatch) && claim.subscriptionId)
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
        data: terminal(
          finished,
          skipProvider ? "CANCELLED" : accepted ? "ACCEPTED" : "FAILED"
        )
      });
    return {
      done: true,
      outcome: skipProvider
        ? "cancelled"
        : accepted
          ? "accepted"
          : expired
            ? "cancelled"
            : "failed"
    };
  });
}
export function openNotification(
  db: PrismaClient,
  token: unknown,
  id: unknown,
  requireDevice = true,
  expectedOwner?: string,
  nativeOnly = false
) {
  return withOwnedSession(
    db,
    token,
    async (tx, session) => {
      requireSessionOwner(session, expectedOwner);
      const epoch = nativeOnly
        ? await tx.nativePushRecovery.findUnique({ where: { id: "current" } })
        : null;
      if (nativeOnly && !epoch)
        throw new PortalError(
          503,
          "Notification access needs a recovery review."
        );
      const row = await tx.notificationDelivery.findFirst({
        where: {
          id: postId(id),
          ownerId: session.userId,
          ...(requireDevice
            ? {
                subscription: {
                  ...(nativeOnly
                    ? { provider: "EXPO", nativeRecoveryEpoch: epoch!.epoch }
                    : {}),
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
        tag: notificationGroupTag(session.userId, source.group)
      };
    },
    true
  );
}
// Keep source-lived terminal guards; remove only content-free attempt diagnostics.
export async function cleanNotificationRecords(tx: Tx, now = new Date()) {
  const revoked = await revokePushSubscriptions(
    tx,
    {
      OR: [
        { expiresAt: { lte: now } },
        { session: { is: null } },
        { session: { is: inactiveAccountSessionWhere(now) } }
      ]
    },
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
