import { PortalError } from "./portal-policy";
import { postField, postId } from "./post-input";
import { socialInput } from "./social-operations";
import { discoveryCountry, discoveryPlaceId } from "./discovery-options";
import {
  EXCHANGE_EDITOR_SCHEMA, EXCHANGE_MAX_PRICE_MINOR, exchangeCurrencies,
  exchangeIntentLabels, exchangeCategoryLabels, exchangeConditionLabels, exchangePriceText,
  type ExchangeCurrency, type ExchangeEditorFields, type ExchangeCategory, type ExchangeCondition
} from "./exchange-options";

function choice<T extends object>(value: unknown, choices: T, label: string): keyof T {
  if (typeof value !== "string" || !Object.hasOwn(choices, value))
    throw new PortalError(400, `Choose a supported ${label}.`);
  return value as keyof T;
}

export function exchangePriceMinor(value: unknown, currency: unknown) {
  const code = choice(currency, exchangeCurrencies, "currency") as ExchangeCurrency;
  if (typeof value !== "string" || value.length > 16)
    throw new PortalError(400, "Enter a price using digits and a decimal point, without a currency symbol.");
  const digits = exchangeCurrencies[code].digits;
  const parts = /^(0|[1-9]\d{0,8})(?:\.(\d+))?$/.exec(value.trim());
  if (!parts || (parts[2]?.length ?? 0) > digits || (digits === 0 && parts[2] !== undefined))
    throw new PortalError(400, `Use a whole amount or up to ${digits} decimal places for ${code}. Your price has not been rounded.`);
  const minor = Number(parts[1]) * 10 ** digits + Number((parts[2] ?? "").padEnd(digits, "0"));
  if (!Number.isSafeInteger(minor) || minor < 1 || minor > EXCHANGE_MAX_PRICE_MINOR)
    throw new PortalError(400, "Enter a positive price within the supported item-price limit.");
  return minor;
}

const fields = ["intent", "title", "description", "category", "condition", "currency",
  "price", "country", "placeId", "audience", "audienceChurchId"] as const;

export type ExchangeListingFields = Omit<ExchangeEditorFields,
  "category" | "condition" | "currency" | "price" | "country" | "placeId" | "audienceChurchId"> & {
  category: ExchangeCategory | null;
  condition: ExchangeCondition | null;
  currency: ExchangeCurrency | null;
  priceMinor: number | null;
  country: string | null;
  placeId: number | null;
  audienceChurchId: string | null;
};

export function parseExchangeFields(schema: unknown, input: unknown, publication = false): ExchangeListingFields {
  if (schema !== EXCHANGE_EDITOR_SCHEMA || !input || typeof input !== "object" || Array.isArray(input))
    throw new PortalError(400, "Reload the current listing editor. Keep your unsent entries.");
  const value = input as Record<string, unknown>;
  socialInput(value, [...fields]);
  if (fields.some(key => !Object.hasOwn(value, key)))
    throw new PortalError(400, "Send the complete listing form. Keep your unsent entries.");
  const intent = choice(value.intent, exchangeIntentLabels, "listing type");
  const title = postField(value.title, 120, publication ? 3 : 0);
  const description = postField(value.description, 5000, publication ? 1 : 0);
  const category = value.category === "" && !publication ? "" : choice(value.category, exchangeCategoryLabels, "item category");
  const condition = value.condition === "" && !publication ? "" : choice(value.condition, exchangeConditionLabels, "item condition");
  const audience = value.audience;
  if (audience !== "PUBLIC" && audience !== "CHURCH")
    throw new PortalError(400, "Choose Public or Your church for this listing.");
  const audienceChurchId = value.audienceChurchId === "" ? null : postId(value.audienceChurchId);
  if (audience === "PUBLIC" && audienceChurchId !== null)
    throw new PortalError(400, "A public listing cannot carry a hidden church audience.");
  if (publication && audience === "CHURCH" && !audienceChurchId)
    throw new PortalError(400, "Choose your currently approved church before publishing.");
  const country = discoveryCountry(value.country);
  const placeId = discoveryPlaceId(value.placeId);
  if (!country && placeId !== null)
    throw new PortalError(400, "Choose a country and its coarse town together.");
  if (publication && !placeId)
    throw new PortalError(400, "Choose a coarse pickup town before publishing. Do not enter a street address.");
  let currency: ExchangeCurrency | null = null;
  let priceMinor: number | null = null;
  if (intent === "FREE") {
    if (value.currency !== "" || value.price !== "")
      throw new PortalError(400, "A free listing cannot carry a price or currency. Clear both fields deliberately.");
  } else {
    if (value.currency !== "") currency = choice(value.currency, exchangeCurrencies, "currency");
    if (value.price !== "") priceMinor = exchangePriceMinor(value.price, currency);
    if (publication && (currency === null || priceMinor === null))
      throw new PortalError(400, "Choose the currency and price before publishing a for-sale listing.");
  }
  return { intent, title, description, category: category || null, condition: condition || null,
    currency, priceMinor, country: country || null, placeId, audience, audienceChurchId };
}

export function exchangeEditorFields(value: ExchangeListingFields): ExchangeEditorFields {
  const { priceMinor, ...record } = value;
  const currency = value.currency;
  const price = priceMinor === null || currency === null ? "" : exchangePriceText(priceMinor, currency);
  return { ...record, currency: currency ?? "", price, category: value.category ?? "",
    condition: value.condition ?? "", country: value.country ?? "", placeId: value.placeId,
    audienceChurchId: value.audienceChurchId ?? "" };
}
