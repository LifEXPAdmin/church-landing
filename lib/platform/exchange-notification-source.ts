import type { Prisma, SocialEvent } from "@prisma/client";
import type { PostContext } from "./post-access";
import type { NotificationSource } from "./notification-source";
import { exchangeDiscoveryWhere } from "./exchange-policy";
import { exchangeAlertCriteriaWhere } from "./exchange-alert-criteria";

export async function exchangeNotificationSources(
  tx: Prisma.TransactionClient,
  events: SocialEvent[],
  context: PostContext,
  channel: string
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
  const matches = await tx.exchangeSearchMatch.findMany({
    where: {
      ownerId: context.actorId,
      listingId: { in: events.map((event) => event.sourceId!) },
      search: {
        deletedAt: null,
        recoveryRequired: false,
        alertsSince: { not: null }
      }
    },
    include: {
      search: {
        select: {
          schema: true,
          criteria: true,
          alertsSince: true,
          version: true
        }
      },
      listing: { select: { country: true, placeId: true } }
    },
    take: 50
  });
  const clauses: Prisma.ExchangeListingWhereInput[] = [];
  const eligible = new Map<string, (typeof matches)[number]>();
  for (const event of events) {
    const match = matches.find((row) => row.listingId === event.sourceId);
    if (
      !match ||
      event.recipientId !== context.actorId ||
      event.actorId === context.actorId ||
      event.notificationCategory !== "exchange" ||
      event.sourceVersion !== match.listingVersion ||
      event.createdAt.getTime() !== match.publishedAt.getTime() ||
      match.search.schema !== 1 ||
      match.search.version !== match.searchVersion ||
      !match.search.alertsSince ||
      match.search.alertsSince >= match.publishedAt
    )
      continue;
    const criteria = await exchangeAlertCriteriaWhere(
      match.search.criteria,
      match.listing
    );
    if (!criteria) continue;
    eligible.set(event.id, match);
    clauses.push({
      AND: [
        {
          id: match.listingId,
          publishedAt: match.publishedAt,
          version: { gte: match.listingVersion },
          state: "ACTIVE"
        },
        criteria
      ]
    });
  }
  if (!clauses.length) return result;
  const visible = new Set(
    (
      await tx.exchangeListing.findMany({
        where: { AND: [exchangeDiscoveryWhere(context), { OR: clauses }] },
        select: { id: true },
        take: 50
      })
    ).map((row) => row.id)
  );
  for (const event of events) {
    const match = eligible.get(event.id);
    if (match && visible.has(match.listingId))
      result.set(event.id, {
        category: "exchange",
        href: `/platform/exchange/${match.listingId}`,
        group: `exchange-listing:${match.listingId}`,
        summary: "A new listing matches one of your saved searches."
      });
  }
  return result;
}
