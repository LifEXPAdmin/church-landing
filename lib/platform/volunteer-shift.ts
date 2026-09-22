import { Temporal } from "@js-temporal/polyfill";
import type { CalendarOccurrence, PostVolunteerSlot } from "@prisma/client";
import { calendarInstant } from "./calendar-time";
import { PortalError } from "./portal-policy";

type SlotTime = Pick<PostVolunteerSlot, "shiftStartAt" | "shiftEndAt">;
type EventTime = Pick<
  CalendarOccurrence,
  "startAt" | "endAt" | "startLocal" | "endLocal" | "timeZone" | "allDay"
>;

export function parseVolunteerShift(
  input: Record<string, unknown>,
  occurrence: EventTime,
  prior?: SlotTime
) {
  if (input.independentTime === undefined) {
    if (
      input.shiftStartLocal !== undefined ||
      input.shiftEndLocal !== undefined
    )
      throw new PortalError(
        400,
        "Choose whether this shift has its own times."
      );
    return {
      shiftStartAt: prior?.shiftStartAt ?? null,
      shiftEndAt: prior?.shiftEndAt ?? null
    };
  }
  if (typeof input.independentTime !== "boolean")
    throw new PortalError(400, "Choose whether this shift has its own times.");
  if (!input.independentTime) return { shiftStartAt: null, shiftEndAt: null };
  const start = calendarInstant(input.shiftStartLocal, occurrence.timeZone);
  const end = calendarInstant(input.shiftEndLocal, occurrence.timeZone);
  if (
    end.at <= start.at ||
    start.at < occurrence.startAt ||
    end.at > occurrence.endAt
  )
    throw new PortalError(
      400,
      "Choose a shift that ends after it starts and stays within the event."
    );
  return { shiftStartAt: start.at, shiftEndAt: end.at };
}

// Independent instants remain fixed after a parent edit. Invalid new bounds are
// visible as a conflict and prevent new acceptance until deliberately resolved.
export function volunteerShift(slot: SlotTime, occurrence: EventTime) {
  const independent = !!slot.shiftStartAt && !!slot.shiftEndAt;
  const startAt = slot.shiftStartAt ?? occurrence.startAt;
  const endAt = slot.shiftEndAt ?? occurrence.endAt;
  const wall = (at: Date) =>
    Temporal.Instant.from(at.toISOString())
      .toZonedDateTimeISO(occurrence.timeZone)
      .toPlainDateTime()
      .toString({ smallestUnit: "minute" });
  return {
    independent,
    startAt,
    endAt,
    allDay: independent ? false : occurrence.allDay,
    startLocal: independent ? wall(startAt) : occurrence.startLocal,
    endLocal: independent ? wall(endAt) : occurrence.endLocal,
    conflict:
      independent && (startAt < occurrence.startAt || endAt > occurrence.endAt),
    timeZone: occurrence.timeZone
  };
}
