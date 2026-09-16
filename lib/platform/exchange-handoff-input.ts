import { expandCalendarSchedule } from "./calendar-time";
import { discoveryCountry, discoveryPlaceId } from "./discovery-options";
import { emptyExchangeFields } from "./exchange-options";
import {
  EXCHANGE_DEFAULTS_SCHEMA,
  EXCHANGE_HANDOFF_SCHEMA,
  EXCHANGE_PLAN_DAYS,
  exchangeCancellationReasons,
  exchangePersonalDefaultIntents,
  type ExchangeCancellationReason,
  type ExchangeDefaultFields,
  type ExchangePersonalDefaultIntent
} from "./exchange-handoff-options";
import { postField, postId } from "./post-input";
import { PortalError } from "./portal-policy";
import { socialInput } from "./social-operations";

const DAY = 86400000;
function fields(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PortalError(400, "Use the current Exchange form.");
  const input = value as Record<string, unknown>;
  socialInput(input, keys);
  if (keys.some((key) => !Object.hasOwn(input, key)))
    throw new PortalError(
      400,
      "Keep every field from the current Exchange form."
    );
  return input;
}

export function parseExchangeHandoffPlan(
  schema: unknown,
  value: unknown,
  now = new Date()
) {
  if (schema !== EXCHANGE_HANDOFF_SCHEMA)
    throw new PortalError(
      400,
      "Reload the pickup form before choosing a window."
    );
  const input = fields(value, [
    "startLocal",
    "endLocal",
    "timeZone",
    "pickupDetails"
  ]);
  const { schedule, occurrences } = expandCalendarSchedule({
    allDay: false,
    weeklyUntil: null,
    startLocal: input.startLocal,
    endLocal: input.endLocal,
    timeZone: input.timeZone
  });
  const { startAt, endAt } = occurrences[0];
  if (
    startAt <= now ||
    endAt.getTime() > now.getTime() + EXCHANGE_PLAN_DAYS * DAY ||
    endAt.getTime() - startAt.getTime() > DAY
  )
    throw new PortalError(
      400,
      "Choose a future pickup window within 30 days, lasting at most 24 hours."
    );
  return {
    startAt,
    endAt,
    startLocal: schedule.startLocal,
    endLocal: schedule.endLocal,
    timeZone: schedule.timeZone,
    pickupDetails: postField(input.pickupDetails, 2000)
  };
}

export function parseExchangeCancellation(reason: unknown, note: unknown) {
  if (
    typeof reason !== "string" ||
    !Object.hasOwn(exchangeCancellationReasons, reason)
  )
    throw new PortalError(400, "Choose a reason for ending this handoff.");
  return {
    reason: reason as ExchangeCancellationReason,
    note: postField(note, 500)
  };
}

export function parseExchangeDefaults(
  schema: unknown,
  value: unknown
): ExchangeDefaultFields {
  if (schema !== EXCHANGE_DEFAULTS_SCHEMA)
    throw new PortalError(400, "Reload your listing defaults before saving.");
  const input = fields(value, [
    "intent",
    "audience",
    "audienceChurchId",
    "country",
    "placeId",
    "pickupDetails"
  ]);
  if (
    !exchangePersonalDefaultIntents.includes(
      input.intent as ExchangePersonalDefaultIntent
    )
  )
    throw new PortalError(400, "Choose a supported personal listing type.");
  if (input.audience !== "PUBLIC" && input.audience !== "CHURCH")
    throw new PortalError(400, "Choose Public or One approved church.");
  const audienceChurchId =
    input.audienceChurchId === null ? null : postId(input.audienceChurchId);
  if ((input.audience === "CHURCH") !== !!audienceChurchId)
    throw new PortalError(
      400,
      "Choose the church for this audience, or remove it for Public."
    );
  const country = discoveryCountry(input.country),
    placeId = discoveryPlaceId(input.placeId);
  if (placeId && !country)
    throw new PortalError(400, "Choose the country for this general town.");
  return {
    intent: input.intent as ExchangePersonalDefaultIntent,
    audience: input.audience,
    audienceChurchId,
    country,
    placeId,
    pickupDetails: postField(input.pickupDetails, 2000)
  };
}

// Only these public-listing fields can seed a new personal draft. Private pickup
// text and inquiry consent are deliberately absent; the current audience still
// requires service authorization when the new draft is saved.
export function exchangeDefaultDraftFields(
  value: ExchangeDefaultFields,
  approvedChurches: string[]
) {
  if (
    value.audience === "CHURCH" &&
    !approvedChurches.includes(value.audienceChurchId!)
  )
    throw new PortalError(
      409,
      "Your saved church audience is unavailable. Review your defaults before using them."
    );
  return {
    ...emptyExchangeFields(),
    intent: value.intent,
    audience: value.audience,
    audienceChurchId: value.audienceChurchId ?? "",
    country: value.country ?? "",
    placeId: value.placeId
  };
}
