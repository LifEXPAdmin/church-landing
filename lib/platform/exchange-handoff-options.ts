export const EXCHANGE_HANDOFF_SCHEMA = 1;
export const EXCHANGE_DEFAULTS_SCHEMA = 1;
export const EXCHANGE_INQUIRY_PAGE = 20;
export const EXCHANGE_INQUIRY_DAYS = 14;
export const EXCHANGE_CONFIRM_HOURS = 48;
export const EXCHANGE_RECOVERY_HOURS = 48;
export const EXCHANGE_PLAN_DAYS = 30;

export const exchangeInquiryStateLabels = {
  INQUIRED: "Inquiry sent",
  SELECTED: "Waiting for pickup agreement",
  RESERVED: "Pickup agreed",
  COMPLETED: "Marked complete",
  CANCELED: "Canceled",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn",
  EXPIRED: "Expired",
  REVOKED: "No longer available"
} as const;
export type ExchangeInquiryState = keyof typeof exchangeInquiryStateLabels;
export const exchangeActiveInquiryStates = [
  "INQUIRED",
  "SELECTED",
  "RESERVED"
] as const;
export const exchangeHeldInquiryStates = ["SELECTED", "RESERVED"] as const;
export const exchangeCancellationReasons = {
  CHANGED_PLANS: "Plans changed",
  ITEM_UNAVAILABLE: "The item or help is no longer available",
  COULD_NOT_AGREE: "We could not agree on the handoff",
  NO_SHOW: "The agreed handoff was missed",
  OTHER: "Another reason"
} as const;
export type ExchangeCancellationReason =
  keyof typeof exchangeCancellationReasons;
export const exchangePersonalDefaultIntents = [
  "FREE",
  "SALE",
  "WANTED",
  "SERVICE"
] as const;
export type ExchangePersonalDefaultIntent =
  (typeof exchangePersonalDefaultIntents)[number];
export type ExchangeDefaultFields = {
  intent: ExchangePersonalDefaultIntent;
  audience: "PUBLIC" | "CHURCH";
  audienceChurchId: string | null;
  country: string | null;
  placeId: number | null;
  pickupDetails: string;
};
export type ExchangeHandoffPlanFields = {
  startLocal: string;
  endLocal: string;
  timeZone: string;
  pickupDetails: string;
};
export const emptyExchangeDefaults = (): ExchangeDefaultFields => ({
  intent: "FREE",
  audience: "PUBLIC",
  audienceChurchId: null,
  country: null,
  placeId: null,
  pickupDetails: ""
});
