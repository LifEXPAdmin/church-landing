import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import { calendarCommand } from "../lib/platform/calendar-commands";
import { postCommand } from "../lib/platform/post-commands";
import { participationCommand } from "../lib/platform/post-participation";
import { exchangeNeedCommand } from "../lib/platform/exchange-need-commands";
import { exchangeListingCommand } from "../lib/platform/exchange-listings";
import { EXCHANGE_ITEM_POLICY } from "../lib/platform/exchange-options";
import { NEED_SCHEMA } from "../lib/platform/exchange-need-options";
export async function seedNeedRolePrivacy(db: PrismaClient) {
  await assertPortalTestDatabase(db);
  const prior = process.env.PRIVILEGED_MFA_MODE;
  process.env.PRIVILEGED_MFA_MODE = "off";
  try {
    const f = await seedParticipation(db);
    // A PUBLIC church Need requires a listed fictional receiver church.
    await db.church.update({
      where: { id: f.churchA.id },
      data: { communityListed: true }
    });
    for (const capability of [
      "MANAGE_EXCHANGE_LISTINGS",
      "MODERATE_EXCHANGE_LISTINGS"
    ] as const)
      await db.churchCapabilityGrant.create({
        data: { userId: f.ada.id, churchId: f.churchA.id, capability }
      });
    await db.socialPreferences.upsert({
      where: { ownerId: f.ada.id },
      create: { ownerId: f.ada.id, contactRequests: "EVERYONE" },
      update: { contactRequests: "EVERYONE" }
    });
    const calendar = await db.platformCalendar.findUniqueOrThrow({
      where: { id: f.calendar.id }
    });
    const start = new Date(Date.now() + 8 * 86400000),
      end = new Date(start.getTime() + 7200000);
    const event = await calendarCommand(db, f.ada.token, {
      operation: "create-event",
      calendarId: calendar.id,
      expectedVersion: calendar.version,
      requestKey: randomUUID(),
      title: "Fictional second role event " + randomUUID(),
      organizer: "Fictional team",
      allDay: false,
      startLocal: start.toISOString().slice(0, 16),
      endLocal: end.toISOString().slice(0, 16),
      timeZone: "UTC",
      visibility: "CHURCH"
    });
    const occurrence = await db.calendarOccurrence.findFirstOrThrow({
      where: { eventId: event.id }
    });
    const secondPost = await postCommand(db, f.ada.token, {
      operation: "create",
      requestKey: randomUUID(),
      authorChurchId: f.churchA.id,
      eventOccurrenceId: occurrence.id,
      content: "Fictional second role source",
      audience: "CHURCH"
    });
    const roles = [];
    // The real canonical limit is 12 roles per post. Use 10+11 across two events.
    for (const [postId, count] of [
      [f.post.id, 10],
      [secondPost.id, 11]
    ] as const)
      for (let i = 0; i < count; i++)
        roles.push(
          await participationCommand(db, f.ada.token, {
            postId,
            operation: "configure-slot",
            requestKey: randomUUID(),
            expectedVersion: 0,
            role: "Fictional private role " + randomUUID(),
            capacity: 3,
            closed: false
          })
        );
    const listing = await db.exchangeListing.create({
      data: {
        ownerChurchId: f.churchA.id,
        creatorId: f.ada.id,
        intent: "CHURCH_NEED",
        category: "HOUSEHOLD",
        title: "Fictional role privacy " + randomUUID(),
        description: "Isolated role privacy acceptance",
        requestedItems: "Fictional helpers",
        audience: "PUBLIC",
        country: "US",
        placeId: 4887398,
        placeLabel: "Chicago",
        itemPolicy: EXCHANGE_ITEM_POLICY
      }
    });
    const need = await exchangeNeedCommand(db, f.ada.token, {
      operation: "configure",
      mutationId: randomUUID(),
      listingId: listing.id,
      listingVersion: listing.version,
      expectedVersion: 0,
      deadlineLocal: new Date(Date.now() + 10 * 86400000)
        .toISOString()
        .slice(0, 16),
      timeZone: "UTC",
      acceptCoordinator: true
    });
    await exchangeNeedCommand(db, f.ada.token, {
      operation: "slot",
      mutationId: randomUUID(),
      needId: need.id,
      slotId: randomUUID(),
      expectedVersion: 0,
      schema: NEED_SCHEMA,
      fields: {
        action: "DONATE",
        label: "Fictional existing donation",
        unit: "items",
        target: 3,
        loan: false,
        returnLocal: null,
        returnTimeZone: null,
        returnResponsibility: "",
        volunteerSlotId: null
      }
    });
    const current = await db.exchangeListing.findUniqueOrThrow({
      where: { id: listing.id }
    });
    await exchangeListingCommand(db, f.ada.token, {
      operation: "status",
      mutationId: randomUUID(),
      listingId: listing.id,
      expectedVersion: current.version,
      state: "ACTIVE",
      itemPolicy: EXCHANGE_ITEM_POLICY,
      itemConfirmed: true
    });
    const sourceRoles = await db.postVolunteerSlot.findMany({
      where: { id: { in: roles.map((r) => r.id) } },
      orderBy: { id: "asc" }
    });
    const eventTitles = (
      await db.calendarOccurrence.findMany({
        where: { id: { in: [f.occurrence.id, occurrence.id] } },
        select: { title: true }
      })
    ).map((x) => x.title);
    return {
      ...f,
      listing,
      need,
      sourceRoles,
      eventTitles,
      postIds: [f.post.id, secondPost.id],
      page: "/platform/exchange/" + listing.id + "/needs",
      endpoint:
        "/api/platform/exchange?view=need-roles&listingId=" + listing.id
    };
  } finally {
    if (prior === undefined) delete process.env.PRIVILEGED_MFA_MODE;
    else process.env.PRIVILEGED_MFA_MODE = prior;
  }
}
