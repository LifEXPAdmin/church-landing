import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";

export async function seedSharing(db: PrismaClient) {
  await assertPortalTestDatabase(db);
  const author = await createPortalActor(db, "shareimage");
  const church = await db.church.create({
    data: {
      name: "Fictional public community",
      slug: randomUUID(),
      communityListed: true,
      summary: "Public church layout sample",
      publicEmail: "private-contact@example.test"
    }
  });
  const post = await db.platformPost.create({
    data: {
      authorId: author.id,
      content: "Public sharing image sample",
      audience: "PUBLIC"
    }
  });
  const calendar = await db.platformCalendar.create({
    data: {
      churchId: church.id,
      creatorId: author.id,
      name: "Public calendar",
      timeZone: "UTC",
      requestKey: randomUUID()
    }
  });
  const event = await db.calendarEvent.create({
    data: {
      calendarId: calendar.id,
      requestKey: randomUUID(),
      title: "Fictional public gathering",
      visibility: "PUBLIC",
      timeZone: "UTC",
      startLocal: "2026-10-01T10:00",
      endLocal: "2026-10-01T11:00"
    }
  });
  const occurrence = await db.calendarOccurrence.create({
    data: {
      eventId: event.id,
      ordinal: 0,
      title: event.title,
      description: "Public event layout sample",
      allDay: false,
      timeZone: "UTC",
      startLocal: event.startLocal,
      endLocal: event.endLocal,
      startAt: new Date("2026-10-01T10:00:00Z"),
      endAt: new Date("2026-10-01T11:00:00Z")
    }
  });
  return { author, post, church, calendar, event, occurrence };
}
