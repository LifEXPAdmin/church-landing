// Shared public fields only. Private submission ownership and review data never
// belong in the canonical church projection or in a public preview.
export const listingFields = {
  name: { label: "Church name", max: 120 },
  city: { label: "City or locality", max: 100 },
  region: { label: "State or region", max: 100 },
  country: { label: "Country", max: 100 },
  serviceArea: { label: "Ministry service area", max: 200 },
  locationModel: { label: "Location model", max: 20 },
  website: { label: "Public church website", max: 500 },
  publicEmail: { label: "Public church email", max: 254 },
  publicPhone: { label: "Public church phone", max: 32 },
  summary: { label: "Short factual description", max: 1000 },
  meetingInfo: { label: "Public meeting information", max: 1000 },
  denomination: { label: "Denomination or tradition", max: 120 },
  source: { label: "Where these public details came from", max: 500 }
} as const;
export type ListingData = Record<keyof typeof listingFields, string>;
export function projectListingData(value: unknown): ListingData {
  const data = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    Object.keys(listingFields).map((key) => [
      key,
      key in data && typeof data[key as keyof typeof data] === "string"
        ? data[key as keyof typeof data]
        : key === "locationModel"
          ? "NO_BUILDING"
          : ""
    ])
  ) as ListingData;
}
export const listingStatusLabels: Record<string, string> = {
  DRAFT: "Private draft",
  SUBMITTED: "Waiting for review",
  NEEDS_INFORMATION: "More information needed",
  PUBLISHED: "Published",
  REJECTED: "Not accepted",
  WITHDRAWN: "Withdrawn"
};
