// Shared display and validation values. No database, account or provider state.
export const EXCHANGE_EDITOR_SCHEMA = 1;
export const EXCHANGE_ITEM_POLICY = "ordinary-items-v1";
export const EXCHANGE_MAX_PRICE_MINOR = 99_999_999;
export const EXCHANGE_PHOTO_LIMIT = 8;

export const exchangeIntentLabels = {
  FREE: "Free",
  SALE: "For sale"
} as const;
export type ExchangeIntent = keyof typeof exchangeIntentLabels;

export const exchangeCategoryLabels = {
  HOUSEHOLD: "Household items",
  FURNITURE: "Furniture",
  CLOTHING: "Clothing",
  BOOKS: "Books",
  ELECTRONICS: "Electronics",
  TOOLS: "Ordinary tools",
  HOBBIES: "Hobby and sports equipment"
} as const;
export type ExchangeCategory = keyof typeof exchangeCategoryLabels;

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
};

export function emptyExchangeFields(): ExchangeEditorFields {
  return { intent: "FREE", title: "", description: "", category: "",
    condition: "", currency: "", price: "", country: "", placeId: null,
    audience: "PUBLIC", audienceChurchId: "" };
}

export function exchangePriceText(minor: number, currency: ExchangeCurrency) {
  const digits = exchangeCurrencies[currency].digits;
  const scale = 10 ** digits;
  return digits ? `${Math.floor(minor / scale)}.${String(minor % scale).padStart(digits, "0")}` : String(minor);
}

export const EXCHANGE_ITEM_NOTICE = "Offer only ordinary physical items you are allowed to give away or sell. Describe their condition honestly. Do not list stolen, counterfeit, recalled or unlawful items, weapons, ammunition, alcohol, tobacco, drugs, medicines, explicit adult material, live animals, personal data, accounts or financial products. Services and transport are not available in this item editor.";
export const EXCHANGE_CONTACT_NOTICE = "Keep your phone number, email, exact pickup address and access codes out of the listing and photos. Account verification is not a guarantee of seller safety. Godschurches does not take payments, deposits or provide escrow.";
