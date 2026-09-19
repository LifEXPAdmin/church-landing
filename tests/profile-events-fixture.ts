import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { seedPortal, type PortalActor } from "./seed-portal";
import { portalCommand } from "../lib/platform/portal";
import { calendarCommand } from "../lib/platform/calendar-commands";
import { groupCommand } from "../lib/platform/group-commands";
import { groupEventCommand } from "../lib/platform/group-events";
import { readGroup } from "../lib/platform/group-reads";
import { getProfileEditor } from "../lib/platform/profiles";
import { updateAccountProfile } from "../lib/platform/accounts";

export const profileEventTime = {
  allDay: false,
  startLocal: "2030-10-25T09:00",
  endLocal: "2030-10-25T10:00",
  timeZone: "America/Chicago",
  weeklyUntil: null
};

export async function saveProfileEvent(
  db: PrismaClient,
  actor: PortalActor,
  occurrenceId: string | null,
  overrides: Record<string, unknown> = {}
) {
  const profile = await getProfileEditor(db, actor.token);
  return updateAccountProfile(
    db,
    actor.token,
    {
      name: profile.name,
      bio: profile.bio ?? "",
      location: profile.location ?? "",
      website: profile.website ?? "",
      interests: profile.interests.join(","),
      expectedVersion: profile.presentation.version,
      profileModules: {
        ...profile.presentation.modules,
        calendarOccurrenceId: occurrenceId
      },
      ...overrides
    },
    actor.id
  );
}

export async function profileEventsFixture(db: PrismaClient) {
  const f = await seedPortal(db),
    owner = f.memberA,
    viewer = f.coordinator;
  for (const capability of ["EDIT_CHURCH_CALENDAR", "PUBLISH_CHURCH_EVENTS"])
    await portalCommand(db, f.operator.token, {
      operation: "grant",
      churchId: f.churchA.id,
      userId: owner.id,
      capability,
      expectedVersion: 0
    });
  const command = (input: Record<string, unknown>) =>
    calendarCommand(db, owner.token, input);
  const create = async (personal = false, visibility = "PRIVATE") => {
    const calendar = await command({
      operation: "create-calendar",
      requestKey: randomUUID(),
      name: "Fictional profile event source",
      timeZone: "America/Chicago",
      ...(personal ? {} : { churchId: f.churchA.id })
    });
    const saved = await command({
      operation: "create-event",
      requestKey: randomUUID(),
      calendarId: calendar.id,
      expectedVersion: 1,
      title: "Fictional linked event " + randomUUID(),
      location: "Original fictional room",
      ...profileEventTime
    });
    if (visibility !== "PRIVATE")
      await command({
        operation: "set-visibility",
        eventId: saved.id,
        expectedVersion: 1,
        visibility,
        confirmed: true
      });
    const event = await db.calendarEvent.findUniqueOrThrow({
      where: { id: saved.id },
      include: { occurrences: true }
    });
    return { calendar, event, occurrence: event.occurrences[0] };
  };
  const source = await create(false, "PUBLIC");
  const slug = "profile-event-" + randomUUID();
  const group = await groupCommand(db, owner.token, {
    operation: "create",
    mutationId: randomUUID(),
    schema: 1,
    slug,
    acceptedRules: true,
    leaderDisclosure: true,
    fields: {
      name: "Fictional linked group " + randomUUID(),
      purpose: "A fictional calendar adapter test",
      rules: "Respect everyone and protect private information.",
      kind: "INTEREST",
      discovery: "LISTED",
      joinPolicy: "OPEN",
      format: "LOCAL",
      area: "Fictional town",
      topic: "Music",
      churchId: null
    }
  });
  const read = await readGroup(db, viewer.token, slug);
  await groupCommand(db, viewer.token, {
    operation: "join",
    mutationId: randomUUID(),
    groupId: group.id,
    expectedVersion: read.viewer.version,
    rulesVersion: read.group.rulesVersion,
    acceptedRules: true,
    rosterVisible: false
  });
  await groupEventCommand(db, owner.token, {
    operation: "link-event",
    mutationId: randomUUID(),
    groupId: group.id,
    occurrenceId: source.occurrence.id,
    expectedVersion: 0,
    eventVersion: source.event.version,
    occurrenceVersion: source.occurrence.version,
    confirmed: true
  });
  return {
    ...f,
    owner,
    viewer,
    source,
    group: { ...group, slug },
    create,
    command
  };
}
