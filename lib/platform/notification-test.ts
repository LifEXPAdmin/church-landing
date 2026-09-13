import { withOwnedSession } from "./account-sessions";
import type { PrismaClient } from "@prisma/client";
import { socialCommand, socialInput } from "./social-operations";
import { requireNotificationActor } from "./push-subscriptions";
import { hashSessionToken } from "./auth";
import { expected, PortalError } from "./portal-policy";
import { postId } from "./post-input";
import { activityBudget } from "./account-limits";
import { accountConfig } from "./account-config";
import { pushAvailable } from "./push-config";
import { enqueueNotification } from "./notification-outbox";
export function requestTestNotification(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "operation",
    "mutationId",
    "ownerId",
    "id",
    "expectedVersion"
  ]);
  if (input.operation !== "test")
    throw new PortalError(
      400,
      "Use the test notification button on this device."
    );
  return socialCommand(
    db,
    token,
    "notification-test",
    input,
    async (tx, ownerId) => {
      if (!pushAvailable())
        throw new PortalError(
          503,
          "Phone notifications are not available yet."
        );
      const device = await tx.pushSubscription.findFirst({
        where: {
          id: postId(input.id),
          ownerId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          session: { tokenHash: hashSessionToken(token as string) }
        }
      });
      if (!device)
        throw new PortalError(
          404,
          "Enable notifications for this sign-in and device first."
        );
      expected(input.expectedVersion, device.version);
      const retryAfter = await activityBudget(
        tx,
        accountConfig().rateSecret,
        ownerId,
        "notification-test",
        3,
        600
      );
      if (retryAfter)
        throw new PortalError(
          429,
          "Wait before sending another test notification.",
          retryAfter
        );
      const event = await tx.socialEvent.create({
        data: {
          key: `push-test:${ownerId}:${input.mutationId}`,
          kind: "PUSH_TEST",
          actorId: ownerId,
          recipientId: ownerId
        }
      });
      await enqueueNotification(tx, event, device.id);
      const delivery = await tx.notificationDelivery.findFirst({
        where: { eventId: event.id },
        select: { state: true }
      });
      return {
        id: event.id,
        version: 1,
        message:
          delivery?.state === "FINISHED"
            ? "Quiet hours extend beyond this test’s ten-minute window. Try again after quiet hours."
            : "Test notification queued for this device. Quiet hours apply. This does not confirm phone delivery."
      };
    },
    async (tx, ownerId) => {
      if (input.ownerId !== ownerId)
        throw new PortalError(
          401,
          "Your sign-in changed. Reload before testing notifications."
        );
      await requireNotificationActor(tx, ownerId);
    }
  );
}

export function readTestNotification(
  db: PrismaClient,
  token: unknown,
  id: unknown
) {
  return withOwnedSession(db, token, async (tx, session) => {
    const row = await tx.notificationDelivery.findFirst({
      where: {
        ownerId: session.userId,
        event: {
          id: postId(id),
          kind: "PUSH_TEST",
          recipientId: session.userId
        },
        subscription: { sessionId: session.id }
      },
      select: { state: true, outcome: true, availableAt: true, attempts: true }
    });
    if (!row)
      throw new PortalError(404, "This test is unavailable for this sign-in.");
    return {
      state: row.state,
      outcome: row.outcome,
      retryAt: row.state === "QUEUED" ? row.availableAt.toISOString() : null,
      message:
        row.state === "IN_FLIGHT"
          ? "Attempting delivery to the notification provider."
          : row.state === "QUEUED"
            ? row.attempts
              ? "A delivery retry is queued."
              : "Queued for delivery; quiet hours still apply."
            : row.outcome === "ACCEPTED"
              ? "The provider accepted this test. Check your phone; this does not confirm display or reading."
              : row.outcome === "FAILED"
                ? "The provider did not accept this test. Check this device and try a new test later."
                : "This test was canceled or its diagnostic record has expired. No phone display is confirmed."
    };
  });
}
