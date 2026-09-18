import { calendarInstant } from "./calendar-time";
import { postField } from "./post-input";
import { PortalError } from "./portal-policy";
import { socialInput } from "./social-operations";
import {
  PANTRY_LIMIT,
  PANTRY_SCHEMA,
  pantryAvailability
} from "./pantry-options";

export function pantryBoolean(value: unknown) {
  if (typeof value !== "boolean")
    throw new PortalError(400, "Choose each option explicitly.");
  return value;
}
export function pantryQuantity(value: unknown, zero = false) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < (zero ? 0 : 1) ||
    value > PANTRY_LIMIT
  )
    throw new PortalError(
      400,
      `Use a whole quantity from ${zero ? 0 : 1} to ${PANTRY_LIMIT}.`
    );
  return value;
}
export function pantryFields(schema: unknown, value: unknown, keys: string[]) {
  if (
    schema !== PANTRY_SCHEMA ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  )
    throw new PortalError(
      400,
      "Reload the current assistance form. Keep your entries."
    );
  const fields = value as Record<string, unknown>;
  socialInput(fields, keys);
  if (keys.some((key) => !Object.hasOwn(fields, key)))
    throw new PortalError(
      400,
      "Keep every field from the current assistance form."
    );
  return fields;
}
export function parsePantryHub(schema: unknown, value: unknown) {
  const f = pantryFields(schema, value, [
    "title",
    "description",
    "hours",
    "accessInfo",
    "eligibility",
    "audience",
    "published",
    "intakeEnabled",
    "acceptCoordinator"
  ]);
  if (f.audience !== "PUBLIC" && f.audience !== "CHURCH")
    throw new PortalError(400, "Choose public or current church members.");
  return {
    title: postField(f.title, 120, 3),
    description: postField(f.description, 2000, 3),
    hours: postField(f.hours, 1000, 3),
    accessInfo: postField(f.accessInfo, 1000, 3),
    eligibility: postField(f.eligibility, 1000, 3),
    audience: f.audience,
    published: pantryBoolean(f.published),
    intakeEnabled: pantryBoolean(f.intakeEnabled),
    acceptCoordinator: pantryBoolean(f.acceptCoordinator)
  };
}
export function parsePantryCategory(schema: unknown, value: unknown) {
  const f = pantryFields(schema, value, [
    "label",
    "unit",
    "availability",
    "quantity",
    "description",
    "active",
    "reason"
  ]);
  if (
    typeof f.availability !== "string" ||
    !Object.hasOwn(pantryAvailability, f.availability)
  )
    throw new PortalError(
      400,
      "Choose counted stock, approximate availability or unavailable."
    );
  if (f.availability !== "EXACT" && f.quantity !== null)
    throw new PortalError(
      400,
      "Clear the count unless stock was actually counted."
    );
  return {
    label: postField(f.label, 80, 2),
    unit: postField(f.unit, 40, 1),
    description: postField(f.description, 500),
    availability: f.availability,
    quantity:
      f.availability === "EXACT" ? pantryQuantity(f.quantity, true) : null,
    active: pantryBoolean(f.active),
    reason: postField(f.reason, 300, 3)
  };
}
export function parsePantrySession(
  schema: unknown,
  value: unknown,
  now = new Date()
) {
  const f = pantryFields(schema, value, [
    "startLocal",
    "endLocal",
    "timeZone",
    "capacity",
    "pickupDetails",
    "active"
  ]);
  const start = calendarInstant(f.startLocal, f.timeZone),
    end = calendarInstant(f.endLocal, f.timeZone);
  if (
    start.at <= now ||
    start.at.getTime() > now.getTime() + 366 * 86400000 ||
    end.at <= start.at ||
    end.at.getTime() - start.at.getTime() > 86400000
  )
    throw new PortalError(
      400,
      "Choose a future pickup within one year lasting no more than one day."
    );
  return {
    startLocal: start.local,
    endLocal: end.local,
    timeZone: start.timeZone,
    startsAt: start.at,
    endsAt: end.at,
    capacity: pantryQuantity(f.capacity),
    pickupDetails: postField(f.pickupDetails, 1000, 3),
    active: pantryBoolean(f.active)
  };
}
