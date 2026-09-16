import type { Prisma } from "@prisma/client";
import { exchangeDisplayPrice, exchangeIntentLabels } from "./exchange-options";
// Selected canonical text for existing report and author-decision projections.
// No owner credentials, contact fields, private audiences or image bytes.
export const exchangeEvidenceSelect = {
  title: true,
  description: true,
  intent: true,
  currency: true,
  priceMinor: true,
  category: true,
  condition: true,
  placeLabel: true,
  state: true,
  version: true,
  createdAt: true,
  requestedItems: true,
  neededBy: true,
  serviceArea: true,
  availability: true,
  qualifications: true,
  servicePricing: true,
  serviceUnit: true
} as const;
export function exchangeEvidenceText(
  listing: Prisma.ExchangeListingGetPayload<{
    select: typeof exchangeEvidenceSelect;
  }>
) {
  return [
    listing.title,
    listing.description,
    exchangeIntentLabels[listing.intent],
    exchangeDisplayPrice(listing),
    listing.category,
    listing.condition,
    listing.placeLabel,
    listing.state,
    listing.requestedItems && `Requested items: ${listing.requestedItems}`,
    listing.neededBy && `Needed by: ${listing.neededBy}`,
    listing.serviceArea && `Service area: ${listing.serviceArea}`,
    listing.availability && `Availability: ${listing.availability}`,
    listing.qualifications &&
      `Self-stated qualifications: ${listing.qualifications}`
  ]
    .filter(Boolean)
    .join("\n\n");
}
