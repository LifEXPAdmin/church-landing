// Personal favorites have their own current-access and command owner. Keep all
// listing content and permissions in the enclosing listing freshness check.
export function exchangeListingSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Current listing could not be confirmed.");
  return { ...value, favorite: null };
}
