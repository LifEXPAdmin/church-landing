import type { Prisma } from "@prisma/client";
import { parseSavedExchangeCriteria } from "./exchange-input";
import { discoveryPlaceBands } from "./discovery-places";
import { exchangeSearchWhere } from "./exchange-search";

// Resolve one canonical town reference on the server. Avoid multiplying a large
// town-ID predicate by up to 50 notification sources in a batched access check.
export async function exchangeAlertCriteriaWhere(
  criteria: unknown,
  listing: { country: string | null; placeId: number | null }
): Promise<Prisma.ExchangeListingWhereInput | null> {
  try {
    const { query } = parseSavedExchangeCriteria(criteria);
    if (query.availability && query.availability !== "ACTIVE") return null;
    if (query.radiusKm) {
      if (
        listing.country !== query.country ||
        !listing.placeId ||
        !query.placeId
      )
        return null;
      const bands = await discoveryPlaceBands(
        query.country!,
        query.placeId,
        query.radiusKm
      );
      if (!bands.some((band) => band.placeIds.includes(listing.placeId!)))
        return null;
    }
    return exchangeSearchWhere(query);
  } catch {
    return null;
  }
}
