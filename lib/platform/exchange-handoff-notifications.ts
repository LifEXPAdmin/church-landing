import type { Prisma, SocialEvent } from "@prisma/client";
import type { PostContext } from "./post-access";
import type { NotificationSource } from "./notification-source";
import {
  currentExchangeInquiry,
  exchangeInquiryCleared,
  exchangeInquiryParticipant
} from "./exchange-handoff-policy";

export async function exchangeHandoffNotificationSources(
  tx: Prisma.TransactionClient,
  events: SocialEvent[],
  context: PostContext,
  channel: string,
  now: Date
) {
  const result = new Map<string, NotificationSource>();
  if (
    !context.actorId ||
    !context.eligible ||
    !events.length ||
    events.length > 50 ||
    channel === "EMAIL"
  )
    return result;
  const rows = await tx.exchangeInquiry.findMany({
    where: {
      id: { in: events.map((e) => e.sourceId!) },
      recoveryRequired: false,
      OR: [
        { requesterId: context.actorId, requesterClearedAt: null },
        { receiverId: context.actorId, receiverClearedAt: null }
      ]
    },
    take: 50
  });
  for (const row of rows) {
    if (!(await currentExchangeInquiry(tx, row, now))) continue;
    for (const event of events.filter((e) => e.sourceId === row.id)) {
      if (
        event.recipientId !== context.actorId ||
        event.notificationCategory !== "handoffs" ||
        event.sourceVersion !== row.version ||
        !exchangeInquiryParticipant(row, event.actorId) ||
        !exchangeInquiryParticipant(row, event.recipientId) ||
        exchangeInquiryCleared(row, event.recipientId) ||
        event.actorId === event.recipientId ||
        (event.kind === "EXCHANGE_REMINDER" &&
          (row.state !== "RESERVED" ||
            row.remindedPlanVersion !== row.planVersion ||
            row.windowEnd! <= now))
      )
        continue;
      result.set(event.id, {
        category: "handoffs",
        href: `/platform/exchange/handoffs/${row.id}`,
        group: `exchange-handoff:${row.id}`,
        summary:
          event.kind === "EXCHANGE_REMINDER"
            ? "An agreed Exchange handoff is coming up. Open its current plan."
            : "Your private Exchange inquiry or handoff has an update."
      });
    }
  }
  return result;
}
