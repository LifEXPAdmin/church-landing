import type { Prisma, SocialEvent } from "@prisma/client";
import {
  currentNeedContribution,
  needSource,
  needCoordinatorCurrent
} from "./exchange-need-policy";
import { postReadableWhere, type PostContext } from "./post-access";
import type { NotificationSource } from "./notification-source";

export async function needNotificationSources(
  tx: Prisma.TransactionClient,
  events: SocialEvent[],
  context: PostContext,
  channel: string
) {
  const result = new Map<string, NotificationSource>();
  if (
    !context.actorId ||
    !context.eligible ||
    events.length > 50 ||
    channel === "EMAIL"
  )
    return result;
  for (const event of events) {
    if (
      event.recipientId !== context.actorId ||
      event.actorId === context.actorId ||
      event.notificationCategory !== "needs" ||
      context.blockedIds?.includes(event.actorId)
    )
      continue;
    if (event.kind === "NEED_CONTRIBUTION") {
      const row = await tx.exchangeNeedContribution.findUnique({
        where: { id: event.sourceId ?? "" }
      });
      if (
        !row ||
        row.version !== event.sourceVersion ||
        ![row.contributorId, row.coordinatorId].includes(context.actorId) ||
        ![row.contributorId, row.coordinatorId].includes(event.actorId) ||
        !(await currentNeedContribution(tx, row))
      )
        continue;
      result.set(event.id, {
        category: "needs",
        href: `/platform/exchange/${row.needId}/needs`,
        group: `need-contribution:${row.id}`,
        summary: "Your private Church Needs contribution has an update."
      });
    } else {
      const update = await tx.exchangeNeedEvent.findUnique({
        where: { id: event.sourceId ?? "" }
      });
      if (
        !update ||
        update.version !== event.sourceVersion ||
        update.actorId !== event.actorId ||
        update.createdAt.getTime() !== event.createdAt.getTime()
      )
        continue;
      const need = await needSource(tx, update.needId, context);
      if (
        !need ||
        need.coordinatorId !== event.actorId ||
        !(await needCoordinatorCurrent(tx, need))
      )
        continue;
      const cutoff =
        update.action === "CANCELED_NEED"
          ? (need.canceledAt ?? update.createdAt)
          : update.createdAt;
      const contribution = await tx.exchangeNeedContribution.findFirst({
        where: {
          needId: need.id,
          contributorId: context.actorId,
          createdAt: { lt: cutoff },
          OR: [{ endedAt: null }, { endedAt: { gte: cutoff } }],
          authorityKey: { not: null }
        }
      });
      const eligibleContribution =
        contribution && (await currentNeedContribution(tx, contribution));
      const volunteer = eligibleContribution
        ? null
        : await tx.postVolunteerSignup.findFirst({
            where: {
              userId: context.actorId,
              state: "ACTIVE",
              activeSince: { lt: cutoff },
              slot: {
                exchangeNeedSlot: { needId: need.id },
                post: postReadableWhere(context)
              }
            },
            select: { id: true }
          });
      if (!eligibleContribution && !volunteer) continue;
      result.set(event.id, {
        category: "needs",
        href: `/platform/exchange/${need.listingId}/needs`,
        group: `need-update:${need.id}`,
        summary: "A Church Need you joined has an organizer or deadline update."
      });
    }
  }
  return result;
}
