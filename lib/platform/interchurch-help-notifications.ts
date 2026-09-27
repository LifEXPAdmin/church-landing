import type { SocialEvent } from "@prisma/client";
import type { PostContext, PostTx } from "./post-access";
import type { NotificationSource } from "./notification-source";
import { currentHelpOffers } from "./interchurch-help-policy";
export async function interchurchHelpNotificationSources(
  tx: PostTx,
  events: SocialEvent[],
  context: PostContext,
  channel: string
) {
  const result = new Map<string, NotificationSource>();
  if (
    !context.actorId ||
    !context.eligible ||
    events.length > 50 ||
    channel === "EMAIL" ||
    !events.length
  )
    return result;
  const rows = await tx.interchurchHelpOffer.findMany({
    where: {
      id: { in: events.flatMap((e) => (e.sourceId ? [e.sourceId] : [])) }
    },
    include: { agreement: true },
    take: 50
  });
  const pairs = await currentHelpOffers(tx, rows);
  for (const event of events) {
    const row = rows.find((r) => r.id === event.sourceId);
    if (
      !row ||
      event.recipientId !== context.actorId ||
      event.actorId === context.actorId ||
      event.notificationCategory !== "needs" ||
      event.sourceVersion !== row.version ||
      ![row.responderId, row.coordinatorId].includes(context.actorId) ||
      ![row.responderId, row.coordinatorId].includes(event.actorId) ||
      !pairs.has(row.id)
    )
      continue;
    const consent =
      context.actorId === row.responderId
        ? row.agreement
          ? row.agreement.responderNoticeSince
          : row.noticeSince
        : row.agreement?.requesterNoticeSince;
    if (channel === "PUSH" && (!consent || consent >= event.createdAt))
      continue;
    result.set(event.id, {
      category: "needs",
      href: `/platform/exchange/help/offers?id=${row.id}`,
      group: `interchurch-help:${row.id}`,
      summary: "Your private ministry help has an update."
    });
  }
  return result;
}
