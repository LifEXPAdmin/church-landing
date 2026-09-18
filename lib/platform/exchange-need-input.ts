import { calendarInstant } from "./calendar-time";
import { exchangePriceMinor } from "./exchange-input";
import { exchangeCurrencies } from "./exchange-options";
import {
  NEED_QUANTITY_LIMIT,
  NEED_SCHEMA,
  needActionLabels,
  type NeedAction
} from "./exchange-need-options";
import { postField, postId } from "./post-input";
import { PortalError } from "./portal-policy";
import { socialInput } from "./social-operations";

export function needQuantity(value: unknown, zero = false) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < (zero ? 0 : 1) ||
    value > NEED_QUANTITY_LIMIT
  )
    throw new PortalError(
      400,
      `Use a whole quantity from ${zero ? 0 : 1} to ${NEED_QUANTITY_LIMIT}.`
    );
  return value;
}
export function needBoolean(value: unknown) {
  if (typeof value !== "boolean")
    throw new PortalError(400, "Choose each option explicitly.");
  return value;
}
export function needDeadline(local: unknown, zone: unknown, now = new Date()) {
  const time = calendarInstant(local, zone);
  if (time.at <= now || time.at.getTime() > now.getTime() + 366 * 86400000)
    throw new PortalError(400, "Choose a future deadline within one year.");
  return time;
}
export function parseNeedSlot(
  schema: unknown,
  value: unknown,
  deadline: Date | null,
  now = new Date()
) {
  if (
    schema !== NEED_SCHEMA ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  )
    throw new PortalError(
      400,
      "Reload the current need form. Keep your entries."
    );
  const v = value as Record<string, unknown>;
  const keys = [
    "action",
    "label",
    "unit",
    "target",
    "loan",
    "returnLocal",
    "returnTimeZone",
    "returnResponsibility",
    "volunteerSlotId"
  ];
  socialInput(v, keys);
  if (
    keys.some((k) => !Object.hasOwn(v, k)) ||
    typeof v.action !== "string" ||
    !Object.hasOwn(needActionLabels, v.action)
  )
    throw new PortalError(
      400,
      "Keep every current need field and choose a supported action."
    );
  const action = v.action as NeedAction,
    loan = needBoolean(v.loan);
  const volunteerSlotId =
    v.volunteerSlotId === null ? null : postId(v.volunteerSlotId);
  if ((action === "VOLUNTEER") !== !!volunteerSlotId)
    throw new PortalError(
      400,
      "Volunteer help must use an existing event role. Other actions cannot hold volunteer places."
    );
  if (loan && action !== "DONATE")
    throw new PortalError(
      400,
      "Use a Donate slot to coordinate a physical equipment loan. Financial lending is unavailable."
    );
  const time = loan ? needDeadline(v.returnLocal, v.returnTimeZone, now) : null;
  const responsibility = postField(v.returnResponsibility, 500, loan ? 3 : 0);
  if (time && (!deadline || time.at <= deadline))
    throw new PortalError(
      400,
      "Choose an equipment return after the need deadline."
    );
  if (
    !loan &&
    (v.returnLocal !== null || v.returnTimeZone !== null || responsibility)
  )
    throw new PortalError(400, "Clear loan terms when the item is not a loan.");
  return {
    action,
    label: postField(v.label, 120, 2),
    unit: postField(v.unit, 40, 1),
    target: needQuantity(v.target),
    loan,
    volunteerSlotId,
    returnLocal: time?.local ?? null,
    returnTimeZone: time?.timeZone ?? null,
    returnAt: time?.at ?? null,
    returnResponsibility: responsibility
  };
}
export function needQuote(price: unknown, currency: unknown) {
  if (
    typeof currency !== "string" ||
    !Object.hasOwn(exchangeCurrencies, currency)
  )
    throw new PortalError(400, "Choose a supported quote currency.");
  return {
    quoteMinor: exchangePriceMinor(price, currency),
    quoteCurrency: currency
  };
}
