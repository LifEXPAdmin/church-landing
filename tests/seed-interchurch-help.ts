import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor, type PortalActor } from "./seed-portal";
import { interchurchHelpCommand } from "../lib/platform/interchurch-help-commands";
import { readInterchurchHelp } from "../lib/platform/interchurch-help-reads";
import { EXCHANGE_ITEM_POLICY } from "../lib/platform/exchange-options";
import { calendarCommand } from "../lib/platform/calendar-commands";
import { postCommand } from "../lib/platform/post-commands";
import { participationCommand } from "../lib/platform/post-participation";

export const helpAction = (operation: string, fields: Record<string, unknown> = {}) => ({
  operation, mutationId: randomUUID(), ...fields
});
const local = (date: Date) => date.toISOString().slice(0, 16);
export type HelpScheduleChoice = {
  kind: "EVENT" | "VOLUNTEER_SLOT"; id: string; fingerprint: string;
  title: string; href: string; startLocal: string; endLocal: string;
  timeZone: string; allDay: boolean;
};

// Independent fictional rows. Does not import or execute another test suite.
export async function seedInterchurchHelp(db: PrismaClient) {
  await assertPortalTestDatabase(db);
  const manager = await createPortalActor(db, "linksmanager"),
    responder = await createPortalActor(db, "linksresponder"),
    outsider = await createPortalActor(db, "linksoutsider");
  const church = await db.church.create({ data: {
    slug: "fictional-help-links-" + randomUUID(), name: "Fictional Schedule Church",
    summary: "Isolated collaboration schedule acceptance", communityListed: true
  }});
  await db.churchConnection.createMany({ data: [manager, responder].map(actor => ({
    userId: actor.id, churchId: church.id, state: "APPROVED" as const
  })) });
  await db.churchCapabilityGrant.createMany({ data: ([
    "MANAGE_EXCHANGE_LISTINGS", "MODERATE_EXCHANGE_LISTINGS", "EDIT_CHURCH_CALENDAR",
    "PUBLISH_CHURCH_EVENTS", "PUBLISH_CHURCH_POSTS", "MANAGE_CHURCH_VOLUNTEERS"
  ] as const).map(capability => ({ userId: manager.id, churchId: church.id, capability })) });
  await db.socialPreferences.create({ data: { ownerId: manager.id, contactRequests: "EVERYONE" } });
  const start = new Date(Date.now() + 7 * 86400000);
  start.setUTCHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 3600000);
  const terms = {
    duties: "Prepare fictional adult-only microphones without child contact or supervision.",
    dutyClass: "ADULT_LOGISTICS", equipmentMode: "NONE",
    startLocal: local(new Date(start.getTime() - 86400000)),
    endLocal: local(new Date(end.getTime() - 86400000)), timeZone: "UTC",
    compensation: "VOLUNTARY", price: "", currency: "", rateUnit: "",
    reimbursement: "No expense reimbursement proposed."
  };
  const request = await interchurchHelpCommand(db, manager.token, helpAction("create", {
    expectedVersion: 0, ownerChurchId: church.id, schema: 1,
    fields: { title: "Fictional linked ministry help", category: "AV", terms,
      country: "US", placeId: 4887398, audience: "PUBLIC", acceptCoordinator: true,
      coordinatorDisplay: "Fictional consenting adult coordinator" }
  }));
  await interchurchHelpCommand(db, manager.token, helpAction("publish", {
    requestId: request.id, expectedVersion: request.version,
    itemPolicy: EXCHANGE_ITEM_POLICY, itemConfirmed: true
  }));
  const calendar = await calendarCommand(db, manager.token, {
    operation: "create-calendar", churchId: church.id, requestKey: randomUUID(),
    name: "Fictional collaboration calendar", timeZone: "UTC"
  });
  const event = await calendarCommand(db, manager.token, {
    operation: "create-event", calendarId: calendar.id, expectedVersion: 1,
    requestKey: randomUUID(), title: "Fictional canonical help event",
    organizer: "Fictional adult team", allDay: false, startLocal: local(start),
    endLocal: local(end), timeZone: "UTC", visibility: "CHURCH",
    weeklyUntil: local(new Date(start.getTime() + 7 * 86400000)).slice(0, 10)
  });
  const occurrences = await db.calendarOccurrence.findMany({ where: { eventId: event.id }, orderBy: { ordinal: "asc" } });
  assert.equal(occurrences.length, 2, "Fixture has independently addressable sibling occurrences");
  const occurrence = occurrences[0];
  const post = await postCommand(db, manager.token, {
    operation: "create", requestKey: randomUUID(), authorChurchId: church.id,
    eventOccurrenceId: occurrence.id, content: "Fictional adult-only AV shifts.", audience: "CHURCH"
  });
  const slot = await participationCommand(db, manager.token, {
    operation: "configure-slot", postId: post.id, requestKey: randomUUID(),
    expectedVersion: 0, role: "Fictional adult microphone setup", capacity: 2,
    closed: false, independentTime: true, shiftStartLocal: local(start),
    shiftEndLocal: local(new Date(start.getTime() + 30 * 60000))
  });
  const agreement = (offerId: string) => db.interchurchHelpAgreement.findUniqueOrThrow({ where: { offerId } });
  const acknowledge = async (offerId: string, actor: PortalActor) => {
    const a = await agreement(offerId);
    return interchurchHelpCommand(db, actor.token, helpAction("acknowledge", {
      offerId, expectedVersion: a.version, termsVersion: a.termsVersion,
      requestTermsVersion: a.requestTermsVersion, acceptTerms: true, externalNotices: false
    }));
  };
  const confirm = async (offerId: string) => {
    await acknowledge(offerId, manager);
    await acknowledge(offerId, responder);
    const a = await agreement(offerId);
    assert.equal(a.state, "CONFIRMED");
    return a;
  };
  const offer = async () => {
    const r = await db.interchurchHelpRequest.findUniqueOrThrow({ where: { id: request.id } });
    const made = await interchurchHelpCommand(db, responder.token, helpAction("offer", {
      requestId: request.id, expectedVersion: r.termsVersion, kind: "PERSONAL",
      respondingChurchId: null, schema: 1, terms, acceptResponsibility: true, externalNotices: false
    }));
    await interchurchHelpCommand(db, manager.token, helpAction("select", {
      offerId: made.id, expectedVersion: made.version, requestTermsVersion: r.termsVersion,
      acceptTerms: true, externalNotices: false
    }));
    await acknowledge(made.id, responder);
    return made.id;
  };
  const choices = async (offerId: string, kind: HelpScheduleChoice["kind"] = "EVENT", actor = manager) => {
    const rows: HelpScheduleChoice[] = [];
    let after: string | undefined;
    const cursors = new Set<string>();
    do {
      const result = await readInterchurchHelp(db, actor.token, { view: "schedule", id: offerId, category: kind, ...(after ? { after } : {}) });
      assert.equal(result.view, "schedule");
      if (result.view !== "schedule") throw new Error("Expected canonical schedule choices");
      rows.push(...result.choices);
      assert.ok(result.choices.length <= 20, "Choices remain page bounded");
      after = result.next ?? undefined;
      if (after) { assert.ok(!cursors.has(after), "Cursor must advance"); cursors.add(after); }
    } while (after);
    assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
    return rows;
  };
  const choice = async (offerId: string, kind: HelpScheduleChoice["kind"] = "EVENT", id = kind === "EVENT" ? occurrence.id : slot.id) => {
    const row = (await choices(offerId, kind)).find(item => item.id === id);
    assert.ok(row, "Authorized canonical source must be selectable");
    return row;
  };
  const linkInput = async (offerId: string, schedule: HelpScheduleChoice | null) => {
    const a = await agreement(offerId);
    const r = await db.interchurchHelpRequest.findUniqueOrThrow({ where: { id: request.id } });
    return helpAction("link-schedule", { offerId, expectedVersion: a.version,
      requestTermsVersion: r.termsVersion, acceptTerms: true,
      schedule: schedule ? { kind: schedule.kind, id: schedule.id, fingerprint: schedule.fingerprint } : null });
  };
  const link = async (offerId: string, schedule: HelpScheduleChoice | null) =>
    interchurchHelpCommand(db, manager.token, await linkInput(offerId, schedule));
  const editOccurrence = async (id = occurrence.id, minutes = 30) => {
    const row = await db.calendarOccurrence.findUniqueOrThrow({ where: { id } });
    const parent = await db.calendarEvent.findUniqueOrThrow({ where: { id: row.eventId } });
    return calendarCommand(db, manager.token, {
      operation: "edit-event", eventId: parent.id, scope: "OCCURRENCE", occurrenceId: id,
      expectedVersion: parent.version, occurrenceVersion: row.version,
      title: row.title, description: row.description, location: row.location,
      onlineUrl: row.onlineUrl, organizer: row.organizer, allDay: false,
      startLocal: local(new Date(row.startAt.getTime() + minutes * 60000)),
      endLocal: local(new Date(row.endAt.getTime() + minutes * 60000)), timeZone: row.timeZone
    });
  };
  const cancelOccurrence = async (scope = "OCCURRENCE", id = occurrence.id) => {
    const row = await db.calendarOccurrence.findUniqueOrThrow({ where: { id } });
    const parent = await db.calendarEvent.findUniqueOrThrow({ where: { id: row.eventId } });
    return calendarCommand(db, manager.token, { operation: "cancel-event", eventId: parent.id,
      expectedVersion: parent.version, occurrenceId: id, occurrenceVersion: row.version, scope, confirmed: true });
  };
  const editSlot = async (minutes = 15, closed = false) => {
    const row = await db.postVolunteerSlot.findUniqueOrThrow({ where: { id: slot.id } });
    return participationCommand(db, manager.token, {
      operation: "configure-slot", postId: post.id, slotId: row.id, requestKey: row.requestKey,
      expectedVersion: row.version, role: row.role, capacity: row.capacity, closed,
      independentTime: true, shiftStartLocal: local(new Date(start.getTime() + minutes * 60000)),
      shiftEndLocal: local(new Date(start.getTime() + (minutes + 30) * 60000))
    });
  };
  const participation = async () => ({
    responses: await db.calendarResponse.findMany({ where: { occurrenceId: { in: occurrences.map(row => row.id) } }, orderBy: { id: "asc" } }),
    signups: await db.postVolunteerSignup.findMany({ where: { slotId: slot.id }, orderBy: { id: "asc" } }),
    capacity: (await db.postVolunteerSlot.findUniqueOrThrow({ where: { id: slot.id } })).capacity
  });
  return { manager, responder, outsider, church, request, terms, calendar, event, occurrence,
    occurrences, post, slot, agreement, acknowledge, confirm, offer, choices, choice,
    linkInput, link, editOccurrence, cancelOccurrence, editSlot, participation };
}
