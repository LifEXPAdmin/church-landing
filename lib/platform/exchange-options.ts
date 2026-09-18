// Shared display and validation values. No database, account or provider state.
export const EXCHANGE_EDITOR_SCHEMA = 2;
export const EXCHANGE_SAVED_SCHEMA = 1;
export const EXCHANGE_ITEM_POLICY = "exchange-listings-v3";
export const EXCHANGE_MAX_PRICE_MINOR = 99_999_999;
export const EXCHANGE_PHOTO_LIMIT = 8;

export const exchangeIntentLabels = {
  FREE: "Free",
  SALE: "For sale",
  WANTED: "Wanted",
  SERVICE: "Service",
  CHURCH_NEED: "Church need"
} as const;
export type ExchangeIntent = keyof typeof exchangeIntentLabels;

export const exchangeItemCategoryLabels = {
  HOUSEHOLD: "Household items",
  FURNITURE: "Furniture",
  CLOTHING: "Clothing",
  BOOKS: "Books",
  ELECTRONICS: "Electronics",
  TOOLS: "Ordinary tools",
  HOBBIES: "Hobby and sports equipment"
} as const;
export const exchangeServiceCategoryLabels = {
  HOME_GARDEN: "Home and garden help",
  TECHNOLOGY_HELP: "Technology help",
  CREATIVE_SKILLS: "Creative skills",
  LEARNING_HELP: "Learning and practical skills",
  OTHER_SKILL: "Other skilled help"
} as const;
export const exchangeCategoryLabels = {
  ...exchangeItemCategoryLabels,
  ...exchangeServiceCategoryLabels
};
export type ExchangeCategory = keyof typeof exchangeCategoryLabels;
export const exchangeServicePricingLabels = {
  FREE: "Free help",
  FIXED: "A stated paid rate"
} as const;
export const exchangeServiceUnitLabels = {
  HOUR: "Per hour",
  TASK: "Per described task"
} as const;

export const exchangeConditionLabels = {
  NEW: "New",
  LIKE_NEW: "Like new",
  GOOD: "Good",
  FAIR: "Fair",
  PARTS: "For parts or repair"
} as const;
export type ExchangeCondition = keyof typeof exchangeConditionLabels;

export const exchangeStateLabels = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  RESERVED: "Reserved",
  CLOSED: "Closed",
  ARCHIVED: "Archived"
} as const;
export type ExchangeState = keyof typeof exchangeStateLabels;
export type ExchangeAudience = "PUBLIC" | "CHURCH";

// A displayed price does not represent checkout, currency conversion or a payment.
export const exchangeCurrencies = {
  USD: { label: "US dollar (USD)", digits: 2 },
  CAD: { label: "Canadian dollar (CAD)", digits: 2 },
  EUR: { label: "Euro (EUR)", digits: 2 },
  GBP: { label: "Pound sterling (GBP)", digits: 2 },
  AUD: { label: "Australian dollar (AUD)", digits: 2 },
  NZD: { label: "New Zealand dollar (NZD)", digits: 2 },
  JPY: { label: "Japanese yen (JPY)", digits: 0 },
  CHF: { label: "Swiss franc (CHF)", digits: 2 },
  SEK: { label: "Swedish krona (SEK)", digits: 2 },
  NOK: { label: "Norwegian krone (NOK)", digits: 2 },
  DKK: { label: "Danish krone (DKK)", digits: 2 },
  MXN: { label: "Mexican peso (MXN)", digits: 2 },
  BRL: { label: "Brazilian real (BRL)", digits: 2 },
  INR: { label: "Indian rupee (INR)", digits: 2 },
  ZAR: { label: "South African rand (ZAR)", digits: 2 },
  KWD: { label: "Kuwaiti dinar (KWD)", digits: 3 }
} as const;
export type ExchangeCurrency = keyof typeof exchangeCurrencies;

export const exchangeSortLabels = {
  newest: "Newest first",
  "price-low": "Lowest price first",
  "price-high": "Highest price first",
  nearest: "Nearest approximate area"
} as const;
export const exchangePriceBasisLabels = {
  item: "For sale items",
  hour: "Services per hour",
  task: "Services per described task"
} as const;
export const exchangeAvailabilityLabels = {
  ACTIVE: "Available now",
  RESERVED: "Reserved",
  ALL: "Available and reserved"
} as const;
export type ExchangeSearchQuery = {
  mine?: boolean;
  after?: string;
  intent?: ExchangeIntent;
  category?: ExchangeCategory;
  condition?: ExchangeCondition;
  state?: ExchangeState;
  q?: string;
  country?: string;
  placeId?: number;
  radiusKm?: number;
  scope?: "all" | "public" | "church";
  churchId?: string;
  availability?: keyof typeof exchangeAvailabilityLabels;
  freeOnly?: boolean;
  currency?: ExchangeCurrency;
  basis?: keyof typeof exchangePriceBasisLabels;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  sort?: keyof typeof exchangeSortLabels;
};

/** Canonical, shareable criteria; neither account state nor pagination is inferred. */
export function exchangeSearchParams(
  query: ExchangeSearchQuery,
  pagination = false
) {
  const result = new URLSearchParams();
  for (const key of [
    "intent",
    "category",
    "condition",
    "state",
    "q",
    "country",
    "placeId",
    "radiusKm",
    "churchId",
    "currency",
    "basis"
  ] as const) {
    const value = query[key];
    if (value !== undefined && value !== "") result.set(key, String(value));
  }
  if (query.scope && query.scope !== "all") result.set("scope", query.scope);
  if (query.availability && query.availability !== "ACTIVE")
    result.set("availability", query.availability);
  if (query.sort && query.sort !== "newest") result.set("sort", query.sort);
  if (query.freeOnly) result.set("freeOnly", "1");
  if (query.currency) {
    if (query.minPriceMinor !== undefined)
      result.set(
        "minPrice",
        exchangePriceText(query.minPriceMinor, query.currency)
      );
    if (query.maxPriceMinor !== undefined)
      result.set(
        "maxPrice",
        exchangePriceText(query.maxPriceMinor, query.currency)
      );
  }
  if (pagination && query.after) result.set("after", query.after);
  return result;
}

export type ExchangeEditorFields = {
  intent: ExchangeIntent;
  title: string;
  description: string;
  category: ExchangeCategory | "";
  condition: ExchangeCondition | "";
  currency: ExchangeCurrency | "";
  price: string;
  country: string;
  placeId: number | null;
  audience: ExchangeAudience;
  audienceChurchId: string;
  requestedItems: string;
  neededBy: string;
  serviceArea: string;
  availability: string;
  qualifications: string;
  servicePricing: keyof typeof exchangeServicePricingLabels | "";
  serviceUnit: keyof typeof exchangeServiceUnitLabels | "";
};

export function emptyExchangeFields(): ExchangeEditorFields {
  return {
    intent: "FREE",
    title: "",
    description: "",
    category: "",
    condition: "",
    currency: "",
    price: "",
    country: "",
    placeId: null,
    audience: "PUBLIC",
    audienceChurchId: "",
    requestedItems: "",
    neededBy: "",
    serviceArea: "",
    availability: "",
    qualifications: "",
    servicePricing: "",
    serviceUnit: ""
  };
}

/** Type changes are deliberate and clear the complete incompatible field set. */
export function changeExchangeIntent(
  value: ExchangeEditorFields,
  intent: ExchangeIntent
): ExchangeEditorFields {
  if (intent === value.intent) return value;
  return {
    ...value,
    intent,
    category: "",
    condition: "",
    currency: "",
    price: "",
    requestedItems: "",
    neededBy: "",
    serviceArea: "",
    availability: "",
    qualifications: "",
    servicePricing: "",
    serviceUnit: ""
  };
}

export function exchangePriceText(minor: number, currency: ExchangeCurrency) {
  const digits = exchangeCurrencies[currency].digits;
  const scale = 10 ** digits;
  return digits
    ? `${Math.floor(minor / scale)}.${String(minor % scale).padStart(digits, "0")}`
    : String(minor);
}

export function exchangeDisplayPrice(listing: {
  intent: string;
  currency: string | null;
  priceMinor: number | null;
  servicePricing: string | null;
  serviceUnit: string | null;
}) {
  if (listing.intent === "WANTED") return "Items wanted";
  if (listing.intent === "CHURCH_NEED") return "Church item request";
  if (
    listing.intent === "FREE" ||
    (listing.intent === "SERVICE" && listing.servicePricing === "FREE")
  )
    return "Free";
  if (listing.intent === "SERVICE" && !listing.servicePricing)
    return "Service pricing not selected";
  if (!listing.currency || listing.priceMinor === null)
    return "Price not entered";
  const price = `${listing.currency} ${exchangePriceText(listing.priceMinor, listing.currency as ExchangeCurrency)}`;
  return listing.intent === "SERVICE"
    ? `${price}${listing.serviceUnit === "HOUR" ? " per hour" : listing.serviceUnit === "TASK" ? " per described task" : " (price unit not selected)"}`
    : price;
}

export const EXCHANGE_ITEM_NOTICE =
  "List only ordinary items or lawful skilled help you are allowed to offer or request. Describe items and qualifications honestly. Do not list stolen, counterfeit, recalled or unlawful items, weapons, ammunition, alcohol, tobacco, drugs, medicines, explicit adult material, live animals, personal data, accounts, financial products or money loans. Church Needs may coordinate ordinary physical equipment loans with explicit return terms. Medical care and medical transport claims are not available. This listing does not create an employment, transport, payment or fulfillment agreement.";
export const EXCHANGE_SERVICE_NOTICE =
  "Qualifications are stated by the person offering help. God’s Churches has not verified licenses, training, insurance or suitability. Describe relevant experience accurately without including identity documents, private contact details or client information.";
export const EXCHANGE_CONTACT_NOTICE =
  "Keep your phone number, email, exact pickup address and access codes out of the listing and photos. Account verification is not a guarantee of seller safety. God’s Churches does not take payments, deposits or provide escrow.";
