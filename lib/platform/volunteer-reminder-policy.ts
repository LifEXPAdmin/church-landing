import type { Prisma, SocialEvent } from "@prisma/client";
import { calendarContext, eventAccess, eventInclude } from "./calendar-access";
import { eligibleWhere } from "./portal-policy";
import { volunteerReminderMinutes } from "./calendar-reminder-plan";
import {
  postContext,
  postReadableWhere,
  type PostContext
} from "./post-access";
import { volunteerShift } from "./volunteer-shift";
import type { NotificationSource } from "./notification-source";

/** All three canonical versions increase monotonically for this signup. */
export function volunteerReminderVersion(
  signup: number,
  slot: number,
  occurrence: number
) {
  const version = signup + slot + occurrence;
  return [signup, slot, occurrence, version].every(
    (v) => Number.isSafeInteger(v) && v > 0 && v <= 2147483647
  )
    ? version
    : 0;
}

/** Recheck current assignment, effective shift, access and dated consent at every channel. */
export async function volunteerReminderSources(
  tx: Prisma.TransactionClient,
  events: SocialEvent[],
  delivery: boolean,
  now: Date,
  suppliedContext?: PostContext
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
  const lead = volunteerReminderMinutes(preferences);
  if (!lead || !preferences?.volunteerReminderSince) return result;
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
  const context = suppliedContext ?? (await postContext(tx, ownerId));
  if (context.actorId !== ownerId || !context.eligible) return result;
  const calendar = await calendarContext(tx, actor);
  const rows = await tx.postVolunteerSignup.findMany({
    where: {
      userId: ownerId,
      id: { in: events.map((e) => e.sourceId!) },
      state: "ACTIVE",
      completedAt: null,
      slot: { post: postReadableWhere(context) }
    },
    include: {
      application: true,
      slot: {
        include: {
          opportunity: true,
          post: {
            include: {
              eventOccurrence: { include: { event: { include: eventInclude } } }
            }
          }
        }
      }
    },
    take: 50
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const event of events) {
    const row = byId.get(event.sourceId!),
      slot = row?.slot,
      post = slot?.post,
      o = post?.eventOccurrence;
    if (
      !row ||
      !slot ||
      !post ||
      !o ||
      !post.authorChurchId ||
      (post.audienceChurchId &&
        !context.churches.includes(post.audienceChurchId)) ||
      (post.groupId && !context.groupParticipants?.has(post.groupId)) ||
      (post.topicCommunityId &&
        !context.topicParticipants?.has(post.topicCommunityId)) ||
      row.application?.recoveryRequired ||
      slot.opportunity?.recoveryRequired ||
      (row.application && row.application.state !== "ACCEPTED")
    )
      continue;
    const shift = volunteerShift(slot, o);
    if (
      event.kind !== "VOLUNTEER_REMINDER" ||
      event.notificationCategory !== "commitments" ||
      event.actorId !== ownerId ||
      shift.allDay ||
      shift.conflict ||
      o.canceledAt ||
      o.event.canceledAt ||
      o.event.calendar.archivedAt ||
      volunteerReminderVersion(row.version, slot.version, o.version) !==
        event.sourceVersion ||
      shift.startAt.getTime() - lead * 60000 !== event.createdAt.getTime() ||
      event.createdAt > now ||
      row.updatedAt >= event.createdAt ||
      slot.updatedAt >= event.createdAt ||
      o.updatedAt >= event.createdAt ||
      preferences.volunteerReminderSince >= event.createdAt ||
      (delivery && shift.startAt <= now) ||
      !["EDIT", "DETAILS"].includes(eventAccess(calendar, o.event) ?? "")
    )
      continue;
    result.set(event.id, {
      category: "commitments",
      href: `/platform/commitments?signup=${row.id}`,
      group: `volunteer-reminder:${row.id}`,
      summary: "A reminder for your confirmed volunteer shift",
      expiresAt: shift.startAt
    });
  }
  return result;
}
