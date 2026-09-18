import type { Prisma, SocialEvent } from "@prisma/client";
import type { PostContext } from "./post-access";
import type { NotificationSource } from "./notification-source";
import { currentPantryRequest } from "./pantry-policy";
import { privilegedProjectionAvailable } from "./privileged-auth-policy";
export async function pantryNotificationSources(
  tx: Prisma.TransactionClient,
  events: SocialEvent[],
  context: PostContext,
  channel: string
) {
  const result = new Map<string, NotificationSource>();
  if (
    !events.length ||
    !context.actorId ||
    !context.eligible ||
    events.length > 50 ||
    channel === "EMAIL"
  )
    return result;
  const rows = await tx.pantryRequest.findMany({
    where: {
      id: { in: events.flatMap((e) => (e.sourceId ? [e.sourceId] : [])) }
    },
    take: 50
  });
  for (const event of events) {
    const row = rows.find((r) => r.id === event.sourceId);
    if (
      !row ||
      row.version !== event.sourceVersion ||
      event.recipientId !== context.actorId ||
      event.actorId === context.actorId ||
      event.notificationCategory !== "assistance" ||
      ![row.requesterId, row.coordinatorId].includes(context.actorId) ||
      ![row.requesterId, row.coordinatorId].includes(event.actorId) ||
      !(await currentPantryRequest(tx, row))
    )
      continue;
    if (
      row.coordinatorId === context.actorId &&
      (!(await privilegedProjectionAvailable(tx, context.actorId)) ||
        row.coordinatorClearedAt)
    )
      continue;
    if (row.requesterId === context.actorId && row.requesterClearedAt) continue;
    result.set(event.id, {
      category: "assistance",
      href: `/platform/pantry/requests/${row.id}`,
      group: `pantry-request:${row.id}`,
      summary: "Your private assistance request has an update."
    });
  }
  return result;
}
