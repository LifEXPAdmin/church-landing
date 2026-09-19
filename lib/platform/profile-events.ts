import type { PrismaClient } from "@prisma/client";
import {
  calendarContext,
  eventInclude,
  projectOccurrence
} from "./calendar-access";
import { isEligible, PortalError } from "./portal-policy";
import { withPostRead, type PostContext, type PostTx } from "./post-access";

/** Resolve one reference in the caller's existing permission transaction. */
export async function profileEventIn(
  tx: PostTx,
  context: PostContext,
  occurrenceId: string | null | undefined
) {
  if (!occurrenceId) return null;
  const actor = context.actorId
    ? await tx.platformUser.findUnique({
        where: { id: context.actorId },
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
      })
    : null;
  const row = await tx.calendarOccurrence.findUnique({
    where: { id: occurrenceId },
    include: { event: { include: eventInclude } }
  });
  if (!row || context.blockedIds?.includes(row.event.calendar.ownerId ?? ""))
    return null;
  // A generic member preview gets no assumed membership or owner capabilities.
  const scope = await calendarContext(
    tx,
    actor && isEligible(actor) ? actor : null
  );
  const event = projectOccurrence(scope, row.event, row);
  if (!event || event.access === "BUSY") return null;
  // Do not expose the stored selection, calendar membership, RSVP or edit controls.
  return {
    id: event.id,
    title: event.title,
    location: event.location,
    startAt: event.startAt,
    endAt: event.endAt,
    startLocal: event.startLocal,
    endLocal: event.endLocal,
    allDay: event.allDay,
    timeZone: event.timeZone,
    canceled: event.canceled,
    source: event.source.label
  };
}
export type ProfileEventView = NonNullable<
  Awaited<ReturnType<typeof profileEventIn>>
>;

export function getProfileEventChoice(
  db: PrismaClient,
  token: unknown,
  occurrenceId: unknown,
  expectedOwner: string | null
) {
  if (
    typeof occurrenceId !== "string" ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(occurrenceId)
  )
    throw new PortalError(400, "Choose an event page from this website.");
  return withPostRead(db, token, async (tx, context) => {
    if (!context.actorId || !expectedOwner || context.actorId !== expectedOwner)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
    if (!context.eligible)
      throw new PortalError(
        403,
        "A verified adult account is required to select an event."
      );
    const event = await profileEventIn(tx, context, occurrenceId);
    if (!event || event.canceled)
      throw new PortalError(404, "This event is unavailable to select.");
    return { viewerId: context.actorId, event };
  });
}
