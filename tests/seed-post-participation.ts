import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  seedPortal,
  createPortalActor,
  requestConnection,
  type PortalActor
} from "./seed-portal";
import { portalCommand } from "../lib/platform/portal";
import { calendarCommand } from "../lib/platform/calendar-commands";
import { postCommand } from "../lib/platform/post-commands";
import { participationCommand } from "../lib/platform/post-participation";
export async function seedParticipation(db: PrismaClient) {
  const f = await seedPortal(db),
    ada = f.memberA,
    lee = f.coordinator,
    val = f.contact,
    blake = f.memberB;
  const morgan = await createPortalActor(db, "volunteer");
  const connection = await requestConnection(db, morgan, f.churchA.id);
  await portalCommand(db, f.reviewerA.token, {
    operation: "transition",
    action: "APPROVE",
    churchId: f.churchA.id,
    connectionId: connection.id,
    expectedVersion: connection.version
  });
  for (const capability of [
    "PUBLISH_CHURCH_POSTS",
    "EDIT_CHURCH_CALENDAR",
    "PUBLISH_CHURCH_EVENTS",
    "MANAGE_CHURCH_VOLUNTEERS"
  ])
    await portalCommand(db, f.operator.token, {
      operation: "grant",
      churchId: f.churchA.id,
      userId: ada.id,
      capability,
      expectedVersion: 0
    });
  const calendar = await calendarCommand(db, ada.token, {
    operation: "create-calendar",
    churchId: f.churchA.id,
    requestKey: randomUUID(),
    name: "Fictional outreach calendar",
    timeZone: "UTC"
  });
  const start = new Date(Date.now() + 7 * 86400000),
    end = new Date(start.getTime() + 2 * 3600000);
  const event = await calendarCommand(db, ada.token, {
    operation: "create-event",
    calendarId: calendar.id,
    expectedVersion: 1,
    requestKey: randomUUID(),
    title: "Fictional neighborhood outreach",
    organizer: "Fictional outreach team",
    allDay: false,
    startLocal: start.toISOString().slice(0, 16),
    endLocal: end.toISOString().slice(0, 16),
    timeZone: "UTC",
    visibility: "CHURCH"
  });
  const occurrence = await db.calendarOccurrence.findFirstOrThrow({
    where: { eventId: event.id }
  });
  const post = await postCommand(db, ada.token, {
    operation: "create",
    requestKey: randomUUID(),
    authorChurchId: f.churchA.id,
    eventOccurrenceId: occurrence.id,
    content: "Plan a fictional outreach with our church.",
    audience: "CHURCH"
  });
  const command = (actor: PortalActor, input: Record<string, unknown>) =>
    participationCommand(db, actor.token, { postId: post.id, ...input });
  const poll = (input: Record<string, unknown> = {}) =>
    command(ada, {
      operation: "configure-poll",
      expectedVersion: 0,
      question: "Which preparation would be helpful?",
      options: ["Welcome team", "Food preparation", "Setup"],
      multiple: false,
      closesLocal: new Date(Date.now() + 3 * 86400000)
        .toISOString()
        .slice(0, 16),
      timeZone: "UTC",
      ...input
    });
  const slot = (input: Record<string, unknown> = {}) =>
    command(ada, {
      operation: "configure-slot",
      requestKey: randomUUID(),
      expectedVersion: 0,
      role: "Welcome neighbors",
      capacity: 1,
      closed: false,
      ...input
    });
  return {
    ...f,
    ada,
    lee,
    val,
    morgan,
    blake,
    calendar,
    event,
    occurrence,
    post,
    command,
    poll,
    slot
  };
}
