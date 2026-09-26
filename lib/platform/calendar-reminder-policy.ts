import type { Prisma, SocialEvent } from "@prisma/client";
import { calendarContext, eventAccess, eventInclude } from "./calendar-access";
import { eligibleWhere } from "./portal-policy";
import { calendarReminderMinutes } from "./calendar-reminder-plan";
import type { NotificationSource } from "./notification-source";

/** Revalidate private canonical source and dated consent at every channel boundary. */
export async function calendarReminderSources(
  tx: Prisma.TransactionClient,
  events: SocialEvent[],
  delivery: boolean,
  now: Date
) {
  const result = new Map<string, NotificationSource>();
  const ownerId = events[0]?.recipientId;
  if (
    !ownerId ||
    events.length > 50 ||
    events.some((e) => e.recipientId !== ownerId)
  )
    return result;
  const preferences = await tx.socialPreferences.findUnique({
    where: { ownerId }
  });
  const lead = calendarReminderMinutes(preferences);
  if (!lead || !preferences?.calendarReminderSince) return result;
  const actor = await tx.platformUser.findFirst({
    where: { id: ownerId, ...eligibleWhere },
    select: {
      id: true,
      name: true,
      username: true,
      dateFormat: true,
      timeFormat: true,
      suspendedAt: true,
      deactivatedAt: true,
      emailVerifiedAt: true,
      adultAcknowledgedAt: true,
      adultPolicyVersion: true,
      portalVersion: true
    }
  });
  if (!actor) return result;
  const context = await calendarContext(tx, actor);
  const rows = await tx.calendarResponse.findMany({
    where: {
      userId: ownerId,
      id: { in: events.map((e) => e.sourceId!) },
      state: { in: ["GOING", "MAYBE"] }
    },
    include: { occurrence: { include: { event: { include: eventInclude } } } },
    take: 50
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const event of events) {
    const row = byId.get(event.sourceId!),
      o = row?.occurrence;
    if (
      !row ||
      !o ||
      event.kind !== "CALENDAR_REMINDER" ||
      event.notificationCategory !== "commitments" ||
      event.actorId !== ownerId ||
      o.allDay ||
      o.canceledAt ||
      o.event.canceledAt ||
      o.event.calendar.archivedAt ||
      o.version !== event.sourceVersion ||
      o.startAt.getTime() - lead * 60000 !== event.createdAt.getTime() ||
      event.createdAt > now ||
      row.updatedAt >= event.createdAt ||
      o.updatedAt >= event.createdAt ||
      preferences.calendarReminderSince >= event.createdAt ||
      (delivery && o.startAt <= now) ||
      !["EDIT", "DETAILS"].includes(eventAccess(context, o.event) ?? "")
    )
      continue;
    result.set(event.id, {
      category: "commitments",
      href: `/platform/events/${o.id}`,
      group: `calendar-reminder:${o.id}`,
      summary: "A reminder for an event in your commitments",
      expiresAt: o.startAt
    });
  }
  return result;
}
