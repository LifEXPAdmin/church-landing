import type { NotificationFanoutJob, Prisma } from "@prisma/client";
import { postContext } from "./post-access";
import { exchangeDiscoveryWhere } from "./exchange-policy";
import { exchangeAlertCriteriaWhere } from "./exchange-alert-criteria";
import { recordDomainActivity } from "./domain-activity";

export async function recordExchangeSearchMatch(
  tx: Prisma.TransactionClient,
  job: NotificationFanoutJob,
  searchId: string
) {
  const search = await tx.exchangeSavedSearch.findFirst({
    where: {
      id: searchId,
      deletedAt: null,
      recoveryRequired: false,
      alertsSince: { lt: job.createdAt }
    }
  });
  if (!search || search.ownerId === job.actorId || search.schema !== 1) return;
  const context = await postContext(tx, search.ownerId);
  if (!context.eligible) return;
  const listing = await tx.exchangeListing.findFirst({
    where: {
      AND: [
        exchangeDiscoveryWhere(context),
        {
          id: job.sourceId,
          state: "ACTIVE",
          publishedAt: job.createdAt,
          version: { gte: job.sourceVersion }
        }
      ]
    },
    select: { country: true, placeId: true }
  });
  if (!listing) return;
  const criteria = await exchangeAlertCriteriaWhere(search.criteria, listing);
  if (
    !criteria ||
    !(await tx.exchangeListing.findFirst({
      where: { AND: [{ id: job.sourceId }, criteria] },
      select: { id: true }
    }))
  )
    return;
  const created = await tx.exchangeSearchMatch.createMany({
    data: [
      {
        ownerId: search.ownerId,
        listingId: job.sourceId,
        searchId,
        searchVersion: search.version,
        listingVersion: job.sourceVersion,
        publishedAt: job.createdAt
      }
    ],
    skipDuplicates: true
  });
  if (!created.count) return;
  await recordDomainActivity(tx, {
    kind: "EXCHANGE_MATCH",
    category: "exchange",
    sourceId: job.sourceId,
    sourceVersion: job.sourceVersion,
    actorId: job.actorId,
    recipientId: search.ownerId,
    createdAt: job.createdAt,
    once: true
  });
}
