import test from "node:test";
import assert from "node:assert/strict";
import type { CalendarOccurrence } from "@prisma/client";
import {
  parseVolunteerShift,
  volunteerShift
} from "../lib/platform/volunteer-shift";
import { PortalError } from "../lib/platform/portal-policy";

const event = {
  id: "fictional-event",
  timeZone: "America/Chicago",
  allDay: false,
  startAt: new Date("2027-01-10T16:00:00Z"),
  endAt: new Date("2027-01-10T18:00:00Z"),
  startLocal: "2027-01-10T10:00",
  endLocal: "2027-01-10T12:00"
} as CalendarOccurrence;
const input = (start = "2027-01-10T10:00", end = "2027-01-10T10:30") => ({
  independentTime: true,
  shiftStartLocal: start,
  shiftEndLocal: end
});
const bad = (fn: () => unknown) =>
  assert.throws(fn, (e) => e instanceof PortalError && e.status === 400);

test("legacy slots retain inherited event timing until an explicit edit", () => {
  const slot = parseVolunteerShift({}, event);
  assert.deepEqual(slot, { shiftStartAt: null, shiftEndAt: null });
  assert.equal(volunteerShift(slot, event).startAt, event.startAt);
  const moved = {
    ...event,
    startAt: new Date("2027-01-10T17:00:00Z"),
    startLocal: "2027-01-10T11:00"
  };
  assert.equal(volunteerShift(slot, moved).startLocal, "2027-01-10T11:00");
});
test("two thirty-minute shifts keep independent intervals inside one two-hour occurrence", () => {
  const first = volunteerShift(parseVolunteerShift(input(), event), event);
  const second = volunteerShift(
    parseVolunteerShift(input("2027-01-10T11:00", "2027-01-10T11:30"), event),
    event
  );
  assert.equal(first.endAt.getTime() - first.startAt.getTime(), 1800000);
  assert.equal(second.endAt.getTime() - second.startAt.getTime(), 1800000);
  assert.equal(first.startAt.toISOString(), "2027-01-10T16:00:00.000Z");
  assert.equal(second.startAt.toISOString(), "2027-01-10T17:00:00.000Z");
  assert.equal(first.conflict, false);
  assert.equal(second.conflict, false);
});
test("ordinary edits preserve independent instants; parent moves expose a conflict instead of shifting them", () => {
  const slot = parseVolunteerShift(input(), event);
  assert.deepEqual(parseVolunteerShift({}, event, slot), slot);
  const moved = { ...event, startAt: new Date("2027-01-10T17:00:00Z") };
  const projected = volunteerShift(slot, moved);
  assert.equal(projected.startAt.toISOString(), "2027-01-10T16:00:00.000Z");
  assert.equal(projected.conflict, true);
  assert.deepEqual(
    parseVolunteerShift({ independentTime: false }, event, slot),
    { shiftStartAt: null, shiftEndAt: null }
  );
});
test("missing, reversed and out-of-event endpoints are rejected", () => {
  bad(() =>
    parseVolunteerShift(
      { independentTime: true, shiftStartLocal: event.startLocal },
      event
    )
  );
  bad(() =>
    parseVolunteerShift(input(event.endLocal, event.startLocal), event)
  );
  bad(() =>
    parseVolunteerShift(input("2027-01-10T09:59", "2027-01-10T10:30"), event)
  );
  bad(() =>
    parseVolunteerShift(input("2027-01-10T11:00", "2027-01-10T12:01"), event)
  );
  bad(() => parseVolunteerShift({ shiftStartLocal: event.startLocal }, event));
});
test("source-zone spring gaps and repeated autumn wall times require deliberate unambiguous inputs", () => {
  for (const day of ["2027-03-14", "2027-11-07"]) {
    const transition = {
      ...event,
      startAt: new Date(day + "T06:00:00Z"),
      endAt: new Date(day + "T12:00:00Z")
    };
    const hour = day.includes("03-") ? "02" : "01";
    bad(() =>
      parseVolunteerShift(
        input(`${day}T${hour}:15`, `${day}T${hour}:45`),
        transition
      )
    );
  }
});
