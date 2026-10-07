import { calendarInstant } from "./calendar-time";
import { exchangePriceMinor } from "./exchange-input";
import { exchangeCurrencies } from "./exchange-options";
import { postField } from "./post-input";
import { socialInput } from "./social-operations";
import { PortalError } from "./portal-policy";
import { parseHelpSchedule } from "./interchurch-help-schedule";
import {
  helpCategories,
  helpDutyClasses,
  helpEquipmentModes,
  HELP_SCHEMA,
  type HelpTermsFields
} from "./interchurch-help-options";

export function helpChoice<T extends object>(
  v: unknown,
  choices: T,
  name: string
): keyof T {
  if (typeof v !== "string" || !Object.hasOwn(choices, v))
    throw new PortalError(400, `Choose a supported ${name}.`);
  return v as keyof T;
}
export function helpBoolean(v: unknown) {
  if (typeof v !== "boolean")
    throw new PortalError(400, "Choose each consent explicitly.");
  return v;
}
export function parseHelpTerms(schema: unknown, input: unknown) {
  if (
    schema !== HELP_SCHEMA ||
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  )
    throw new PortalError(
      400,
      "Reload the current ministry help form and keep your entries."
    );
  const v = input as Record<string, unknown>;
  const keys = [
    "duties",
    "dutyClass",
    "equipmentMode",
    "startLocal",
    "endLocal",
    "timeZone",
    "compensation",
    "price",
    "currency",
    "rateUnit",
    "reimbursement"
  ];
  socialInput(v, keys);
  if (keys.some((k) => !Object.hasOwn(v, k)))
    throw new PortalError(400, "Send every current ministry help field.");
  const start = calendarInstant(v.startLocal, v.timeZone),
    end = calendarInstant(v.endLocal, v.timeZone);
  if (
    end.at <= start.at ||
    end.at.getTime() - start.at.getTime() > 366 * 86400000
  )
    throw new PortalError(
      400,
      "Choose an end after the start, within one year."
    );
  const compensation = helpChoice(
    v.compensation,
    { VOLUNTARY: 1, PAID: 1 },
    "paid or voluntary choice"
  );
  if (
    compensation === "VOLUNTARY" &&
    (v.price !== "" || v.currency !== "" || v.rateUnit !== "")
  )
    throw new PortalError(
      400,
      "Clear payment fields for voluntary help. State expenses separately."
    );
  const currency =
    compensation === "PAID"
      ? helpChoice(v.currency, exchangeCurrencies, "currency")
      : null;
  return {
    duties: postField(v.duties, 2000, 3),
    dutyClass: helpChoice(v.dutyClass, helpDutyClasses, "duty classification"),
    equipmentMode: helpChoice(
      v.equipmentMode,
      helpEquipmentModes,
      "equipment arrangement"
    ),
    startLocal: start.local,
    endLocal: end.local,
    timeZone: start.timeZone,
    startAt: start.at,
    endAt: end.at,
    compensation,
    amountMinor: currency ? exchangePriceMinor(v.price, currency) : null,
    currency,
    rateUnit:
      compensation === "PAID"
        ? helpChoice(v.rateUnit, { TASK: 1, HOUR: 1 }, "rate unit")
        : null,
    reimbursement: postField(v.reimbursement, 500, 1)
  };
}
export type HelpTerms = ReturnType<typeof parseHelpTerms>;

// Schedule references belong only to accepted agreements. The existing request
// and offer parser deliberately continues to reject them.
export function parseHelpAgreementTerms(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new PortalError(400, "This agreement needs a current terms review.");
  const { schedule, ...fields } = input as Record<string, unknown>;
  return {
    terms: parseHelpTerms(HELP_SCHEMA, fields),
    schedule: schedule === undefined ? null : parseHelpSchedule(schedule)
  };
}

export function helpAgreementFields(input: unknown) {
  return helpTermsFields(parseHelpAgreementTerms(input).terms);
}
export function helpTermsFields(
  t: Omit<HelpTerms, "startAt" | "endAt">
): HelpTermsFields {
  const digits = t.currency ? exchangeCurrencies[t.currency].digits : 0;
  return {
    duties: t.duties,
    dutyClass: t.dutyClass,
    equipmentMode: t.equipmentMode,
    startLocal: t.startLocal,
    endLocal: t.endLocal,
    timeZone: t.timeZone,
    compensation: t.compensation,
    price:
      t.amountMinor === null
        ? ""
        : (t.amountMinor / 10 ** digits).toFixed(digits),
    currency: t.currency ?? "",
    rateUnit: t.rateUnit ?? "",
    reimbursement: t.reimbursement
  };
}
export function supportedHelpDuty(t: Pick<HelpTerms, "dutyClass">) {
  if (t.dutyClass !== "ADULT_LOGISTICS")
    throw new PortalError(
      409,
      "Child-facing offers and fulfillment are unavailable. Adult logistical work must exclude child contact, records and supervision."
    );
}
export function helpCategory(v: unknown) {
  return helpChoice(v, helpCategories, "ministry help category");
}
