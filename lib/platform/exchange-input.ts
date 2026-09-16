import { PortalError } from "./portal-policy";
import { postField, postId } from "./post-input";
import { socialInput } from "./social-operations";
import {
  DISCOVERY_RADII,
  discoveryCountry,
  discoveryPlaceId
} from "./discovery-options";
import { calendarDate } from "./calendar-time";
import {
  EXCHANGE_EDITOR_SCHEMA,
  EXCHANGE_MAX_PRICE_MINOR,
  exchangeCurrencies,
  exchangeIntentLabels,
  exchangeItemCategoryLabels,
  exchangeServiceCategoryLabels,
  exchangeServicePricingLabels,
  exchangeServiceUnitLabels,
  exchangeConditionLabels,
  exchangeCategoryLabels,
  exchangeStateLabels,
  exchangePriceText,
  exchangeSortLabels,
  exchangePriceBasisLabels,
  exchangeAvailabilityLabels,
  type ExchangeSearchQuery,
  type ExchangeCurrency,
  type ExchangeEditorFields,
  type ExchangeCategory,
  type ExchangeCondition
} from "./exchange-options";

export const exchangeSearchKeys = [
  "intent",
  "country",
  "placeId",
  "after",
  "q",
  "category",
  "condition",
  "radiusKm",
  "scope",
  "churchId",
  "freeOnly",
  "currency",
  "basis",
  "minPrice",
  "maxPrice",
  "sort"
] as const;
export function parseExchangeListQuery(
  input: Record<string, unknown>,
  mine = false
): ExchangeSearchQuery {
  const allowed: readonly string[] = [
    ...exchangeSearchKeys,
    mine ? "state" : "availability"
  ];
  if (
    Object.entries(input).some(
      ([key, value]) =>
        !allowed.includes(key) ||
        (value !== undefined && typeof value !== "string")
    )
  )
    throw new PortalError(400, "Use each supported listing filter once.");
  const intent = input.intent
    ? choice(input.intent, exchangeIntentLabels, "listing type")
    : undefined;
  const category = input.category
    ? choice(input.category, exchangeCategoryLabels, "category")
    : undefined;
  const state = input.state
    ? choice(input.state, exchangeStateLabels, "listing status")
    : undefined;
  const q = postField(input.q ?? "", 120, 0);
  if (q && q.length < 2)
    throw new PortalError(
      400,
      "Use at least two characters to search listings."
    );
  const country = discoveryCountry(input.country || null) ?? undefined;
  if (input.placeId && !/^[1-9]\d{0,8}$/.test(input.placeId as string))
    throw new PortalError(400, "Choose a supported town.");
  const placeId =
    discoveryPlaceId(input.placeId ? Number(input.placeId) : null) ?? undefined;
  if (placeId && !country)
    throw new PortalError(400, "Choose the country for this town.");
  const radiusKm = input.radiusKm ? Number(input.radiusKm) : undefined;
  if (
    input.radiusKm &&
    (!DISCOVERY_RADII.some((r) => String(r) === input.radiusKm) || !placeId)
  )
    throw new PortalError(
      400,
      "Choose a named town and a supported approximate radius."
    );
  const scope = input.scope
    ? choice(input.scope, { all: 1, public: 1, church: 1 }, "audience scope")
    : undefined;
  const churchId = input.churchId ? postId(input.churchId) : undefined;
  if ((scope === "church") !== !!churchId)
    throw new PortalError(
      400,
      "Choose one of your current churches for church-only results."
    );
  const condition = input.condition
    ? choice(input.condition, exchangeConditionLabels, "condition")
    : undefined;
  const availability = input.availability
    ? choice(input.availability, exchangeAvailabilityLabels, "availability")
    : undefined;
  const sort = input.sort
    ? choice(input.sort, exchangeSortLabels, "sort order")
    : undefined;
  const freeOnly = input.freeOnly === "1" || undefined;
  if (input.freeOnly && input.freeOnly !== "1")
    throw new PortalError(400, "Use the Free only choice.");
  const currency = input.currency
    ? choice(input.currency, exchangeCurrencies, "currency")
    : undefined;
  const basis = input.basis
    ? choice(input.basis, exchangePriceBasisLabels, "price basis")
    : undefined;
  const priced = !!(
    currency ||
    basis ||
    input.minPrice ||
    input.maxPrice ||
    sort?.startsWith("price-")
  );
  if (priced && (!currency || !basis || freeOnly))
    throw new PortalError(
      400,
      "Choose both a currency and price basis, or clear paid-price choices to use Free only."
    );
  const minPriceMinor = input.minPrice
    ? exchangePriceMinor(input.minPrice, currency, true)
    : undefined;
  const maxPriceMinor = input.maxPrice
    ? exchangePriceMinor(input.maxPrice, currency, true)
    : undefined;
  if (
    minPriceMinor !== undefined &&
    maxPriceMinor !== undefined &&
    minPriceMinor > maxPriceMinor
  )
    throw new PortalError(
      400,
      "The minimum price must not exceed the maximum price."
    );
  if (sort === "nearest" && !radiusKm)
    throw new PortalError(
      400,
      "Choose a named town and approximate radius before sorting by nearest area."
    );
  if (
    input.after &&
    (typeof input.after !== "string" ||
      input.after.length > 1800 ||
      !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(input.after))
  )
    throw new PortalError(
      409,
      "This listing page changed. Refresh the current search."
    );
  return {
    intent,
    category,
    state,
    q: q || undefined,
    country,
    placeId,
    radiusKm,
    scope,
    churchId,
    condition,
    availability,
    sort,
    freeOnly,
    currency,
    basis,
    minPriceMinor,
    maxPriceMinor,
    after: (input.after as string) || undefined
  };
}

function choice<T extends object>(
  value: unknown,
  choices: T,
  label: string
): keyof T {
  if (typeof value !== "string" || !Object.hasOwn(choices, value))
    throw new PortalError(400, `Choose a supported ${label}.`);
  return value as keyof T;
}

export function exchangePriceMinor(
  value: unknown,
  currency: unknown,
  allowZero = false
) {
  const code = choice(
    currency,
    exchangeCurrencies,
    "currency"
  ) as ExchangeCurrency;
  if (typeof value !== "string" || value.length > 16)
    throw new PortalError(
      400,
      "Enter a price using digits and a decimal point, without a currency symbol."
    );
  const digits = exchangeCurrencies[code].digits;
  const parts = /^(0|[1-9]\d{0,8})(?:\.(\d+))?$/.exec(value.trim());
  if (
    !parts ||
    (parts[2]?.length ?? 0) > digits ||
    (digits === 0 && parts[2] !== undefined)
  )
    throw new PortalError(
      400,
      `Use a whole amount or up to ${digits} decimal places for ${code}. Your price has not been rounded.`
    );
  const minor =
    Number(parts[1]) * 10 ** digits +
    Number((parts[2] ?? "").padEnd(digits, "0"));
  if (
    !Number.isSafeInteger(minor) ||
    minor < (allowZero ? 0 : 1) ||
    minor > EXCHANGE_MAX_PRICE_MINOR
  )
    throw new PortalError(
      400,
      "Enter a positive price within the supported item-price limit."
    );
  return minor;
}

const fields = [
  "intent",
  "title",
  "description",
  "category",
  "condition",
  "currency",
  "price",
  "country",
  "placeId",
  "audience",
  "audienceChurchId",
  "requestedItems",
  "neededBy",
  "serviceArea",
  "availability",
  "qualifications",
  "servicePricing",
  "serviceUnit"
] as const;

export type ExchangeListingFields = Omit<
  ExchangeEditorFields,
  | "category"
  | "condition"
  | "currency"
  | "price"
  | "country"
  | "placeId"
  | "audienceChurchId"
  | "neededBy"
  | "servicePricing"
  | "serviceUnit"
> & {
  category: ExchangeCategory | null;
  condition: ExchangeCondition | null;
  currency: ExchangeCurrency | null;
  priceMinor: number | null;
  country: string | null;
  placeId: number | null;
  audienceChurchId: string | null;
  neededBy: string | null;
  servicePricing: keyof typeof exchangeServicePricingLabels | null;
  serviceUnit: keyof typeof exchangeServiceUnitLabels | null;
};

export function parseExchangeFields(
  schema: unknown,
  input: unknown,
  publication = false
): ExchangeListingFields {
  if (
    schema !== EXCHANGE_EDITOR_SCHEMA ||
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  )
    throw new PortalError(
      400,
      "Reload the current listing editor. Keep your unsent entries."
    );
  const value = input as Record<string, unknown>;
  socialInput(value, [...fields]);
  if (fields.some((key) => !Object.hasOwn(value, key)))
    throw new PortalError(
      400,
      "Send the complete listing form. Keep your unsent entries."
    );
  const intent = choice(value.intent, exchangeIntentLabels, "listing type");
  const title = postField(value.title, 120, publication ? 3 : 0);
  const description = postField(value.description, 5000, publication ? 1 : 0);
  const service = intent === "SERVICE",
    request = intent === "WANTED" || intent === "CHURCH_NEED";
  const category =
    value.category === "" && !publication
      ? ""
      : service
        ? choice(
            value.category,
            exchangeServiceCategoryLabels,
            "service category"
          )
        : choice(value.category, exchangeItemCategoryLabels, "item category");
  const condition = service
    ? null
    : value.condition === "" && (!publication || request)
      ? null
      : choice(value.condition, exchangeConditionLabels, "item condition");
  if (service && value.condition !== "")
    throw new PortalError(
      400,
      "A service cannot carry an item condition. Clear the old item fields deliberately."
    );
  const requestedItems = postField(
    value.requestedItems,
    2000,
    publication && request ? 1 : 0
  );
  const neededBy =
    value.neededBy === "" ? null : calendarDate(value.neededBy).toString();
  if (!request && (requestedItems || neededBy !== null))
    throw new PortalError(
      400,
      "Only Wanted and Church need listings carry requested items and a needed-by date. Clear the previous type's fields deliberately."
    );
  const serviceArea = postField(
    value.serviceArea,
    500,
    publication && service ? 1 : 0
  );
  const availability = postField(
    value.availability,
    1000,
    publication && service ? 1 : 0
  );
  const qualifications = postField(
    value.qualifications,
    2000,
    publication && service ? 1 : 0
  );
  const servicePricing =
    value.servicePricing === "" && (!service || !publication)
      ? null
      : choice(
          value.servicePricing,
          exchangeServicePricingLabels,
          "service price choice"
        );
  const serviceUnit =
    value.serviceUnit === ""
      ? null
      : choice(
          value.serviceUnit,
          exchangeServiceUnitLabels,
          "service price unit"
        );
  if (
    !service &&
    (serviceArea ||
      availability ||
      qualifications ||
      servicePricing !== null ||
      serviceUnit !== null)
  )
    throw new PortalError(
      400,
      "Only a Service listing carries service details. Clear the previous type's fields deliberately."
    );
  if (serviceUnit !== null && servicePricing !== "FIXED")
    throw new PortalError(
      400,
      "A price unit belongs only to a service with a stated paid rate."
    );
  if (publication && servicePricing === "FIXED" && serviceUnit === null)
    throw new PortalError(
      400,
      "State whether the service price is per hour or per described task."
    );
  const audience = value.audience;
  if (audience !== "PUBLIC" && audience !== "CHURCH")
    throw new PortalError(
      400,
      "Choose Public or Your church for this listing."
    );
  const audienceChurchId =
    value.audienceChurchId === "" ? null : postId(value.audienceChurchId);
  if (audience === "PUBLIC" && audienceChurchId !== null)
    throw new PortalError(
      400,
      "A public listing cannot carry a hidden church audience."
    );
  if (publication && audience === "CHURCH" && !audienceChurchId)
    throw new PortalError(
      400,
      "Choose your currently approved church before publishing."
    );
  const country = discoveryCountry(value.country);
  const placeId = discoveryPlaceId(value.placeId);
  if (!country && placeId !== null)
    throw new PortalError(
      400,
      "Choose a country and its coarse town together."
    );
  if (publication && !placeId)
    throw new PortalError(
      400,
      "Choose a coarse town or service area before publishing. Do not enter a street address."
    );
  let currency: ExchangeCurrency | null = null;
  let priceMinor: number | null = null;
  if (intent !== "SALE" && !(service && servicePricing === "FIXED")) {
    if (value.currency !== "" || value.price !== "")
      throw new PortalError(
        400,
        "This listing type cannot carry a price or currency. Clear both fields deliberately."
      );
  } else {
    if (value.currency !== "")
      currency = choice(value.currency, exchangeCurrencies, "currency");
    if (value.price !== "")
      priceMinor = exchangePriceMinor(value.price, currency);
    if (publication && (currency === null || priceMinor === null))
      throw new PortalError(
        400,
        "Choose the currency and exact price before publishing a paid listing."
      );
  }
  return {
    intent,
    title,
    description,
    category: category || null,
    condition: condition || null,
    currency,
    priceMinor,
    country: country || null,
    placeId,
    audience,
    audienceChurchId,
    requestedItems,
    neededBy,
    serviceArea,
    availability,
    qualifications,
    servicePricing,
    serviceUnit
  };
}

export function exchangeEditorFields(
  value: ExchangeListingFields
): ExchangeEditorFields {
  const { priceMinor, ...record } = value;
  const currency = value.currency;
  const price =
    priceMinor === null || currency === null
      ? ""
      : exchangePriceText(priceMinor, currency);
  return {
    ...record,
    currency: currency ?? "",
    price,
    category: value.category ?? "",
    condition: value.condition ?? "",
    country: value.country ?? "",
    placeId: value.placeId,
    audienceChurchId: value.audienceChurchId ?? "",
    neededBy: value.neededBy ?? "",
    servicePricing: value.servicePricing ?? "",
    serviceUnit: value.serviceUnit ?? ""
  };
}
