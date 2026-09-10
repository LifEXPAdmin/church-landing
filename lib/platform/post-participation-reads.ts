import type { PrismaClient, Prisma } from "@prisma/client";
import { eligibleWhere, PortalError } from "./portal";
import {
  postCanEdit,
  postId,
  postReadableWhere,
  withPostRead,
  type PostContext,
  type PostTx
} from "./post-access";
import {
  canOrganize,
  canParticipate,
  participationActive,
  participationPost,
  participationInclude
} from "./post-participation";

export function getPostParticipation(
  db: PrismaClient,
  token: unknown,
  id: string
) {
  return withPostRead(db, token, async (tx, context) => {
    const post = await participationPost(tx, context, id);
    const eligible = await canParticipate(tx, context, post),
      active = participationActive(post);
    const poll = await tx.postPoll.findUnique({
      where: { postId: post.id },
      include: { options: { orderBy: { position: "asc" } } }
    });
    const ballot =
      poll && context.actorId
        ? await tx.postPollBallot.findUnique({
            where: {
              pollId_userId: { pollId: poll.id, userId: context.actorId }
            },
            select: { optionIds: true, version: true }
          })
        : null;
    const ballotWhere: Prisma.PostPollBallotWhereInput = {
      pollId: poll?.id ?? "",
      user: {
        ...eligibleWhere,
        ...(post.audienceChurchId
          ? {
              connections: {
                some: { churchId: post.audienceChurchId, state: "APPROVED" }
              }
            }
          : {})
      }
    };
    const pollView = poll
      ? {
          id: poll.id,
          question: poll.question,
          multiple: poll.multiple,
          closesAt: poll.closesAt.toISOString(),
          closesLocal: poll.closesLocal,
          timeZone: poll.timeZone,
          version: poll.version,
          closed: !!poll.closedAt || poll.closesAt <= new Date() || !active,
          locked: !!poll.lockedAt,
          options: await Promise.all(
            poll.options.map(async (o) => ({
              id: o.id,
              label: o.label,
              count: await tx.postPollBallot.count({
                where: { ...ballotWhere, optionIds: { has: o.id } }
              })
            }))
          ),
          total: await tx.postPollBallot.count({ where: ballotWhere }),
          ballot
        }
      : null;
    const slots = await tx.postVolunteerSlot.findMany({
      where: { postId: post.id },
      orderBy: { id: "asc" },
      take: 12,
      include: {
        _count: { select: { signups: { where: { state: "ACTIVE" } } } },
        signups: {
          where: { userId: context.actorId ?? "" },
          select: {
            id: true,
            state: true,
            version: true,
            eventVersion: true,
            occurrenceVersion: true
          }
        }
      }
    });
    const occurrence = post.eventOccurrence;
    return {
      postId: post.id,
      eligible,
      canEdit: postCanEdit(context, post),
      canOrganize: canOrganize(context, post),
      active,
      signedIn: !!context.actorId,
      churchScoped: !!post.audienceChurchId,
      poll: pollView,
      event: occurrence
        ? {
            id: occurrence.id,
            title: occurrence.title,
            organizer: occurrence.organizer,
            startAt: occurrence.startAt.toISOString(),
            endAt: occurrence.endAt.toISOString(),
            timeZone: occurrence.timeZone,
            allDay: occurrence.allDay,
            startLocal: occurrence.startLocal,
            endLocal: occurrence.endLocal,
            canceled: !!occurrence.canceledAt || !!occurrence.event.canceledAt
          }
        : null,
      slots: slots.map((slot) => ({
        id: slot.id,
        role: slot.role,
        capacity: slot.capacity,
        filled: slot._count.signups,
        closed: !!slot.closedAt,
        version: slot.version,
        signup: slot.signups[0]
          ? {
              id: slot.signups[0].id,
              state: slot.signups[0].state,
              version: slot.signups[0].version,
              detailsChanged:
                slot.signups[0].eventVersion !== occurrence?.event.version ||
                slot.signups[0].occurrenceVersion !== occurrence?.version
            }
          : null
      }))
    };
  });
}
export type ParticipationView = Awaited<
  ReturnType<typeof getPostParticipation>
>;
export function getVolunteerRoster(
  db: PrismaClient,
  token: unknown,
  slotId: string,
  cursor?: string
) {
  return withPostRead(db, token, async (tx, context) => {
    const slot = await tx.postVolunteerSlot.findUnique({
      where: { id: postId(slotId) }
    });
    if (!slot) throw new PortalError(404, "Volunteer role unavailable.");
    const post = await participationPost(tx, context, slot.postId);
    if (!canOrganize(context, post))
      throw new PortalError(
        403,
        "An authorized church volunteer organizer may view this roster."
      );
    const rows = await tx.postVolunteerSignup.findMany({
      where: {
        slotId: slot.id,
        state: "ACTIVE",
        ...(cursor ? { id: { gt: postId(cursor) } } : {})
      },
      select: {
        id: true,
        user: { select: { name: true, suspendedAt: true, deactivatedAt: true } }
      },
      orderBy: { id: "asc" },
      take: 101
    });
    return {
      role: slot.role,
      capacity: slot.capacity,
      total: await tx.postVolunteerSignup.count({
        where: { slotId: slot.id, state: "ACTIVE" }
      }),
      people: rows.slice(0, 100).map((r) => ({
        id: r.id,
        name:
          r.user.suspendedAt || r.user.deactivatedAt
            ? "Unavailable account"
            : r.user.name
      })),
      nextCursor: rows.length > 100 ? rows[99].id : null
    };
  });
}
export async function volunteerCommitmentsIn(
  tx: PostTx,
  context: PostContext,
  where: Prisma.CalendarOccurrenceWhereInput
) {
  const rows = await tx.postVolunteerSignup.findMany({
    where: {
      userId: context.actorId ?? "",
      state: "ACTIVE",
      slot: { post: { eventOccurrence: where } }
    },
    include: { slot: { include: { post: { include: participationInclude } } } },
    take: 1001,
    orderBy: { id: "asc" }
  });
  if (rows.length > 1000)
    throw new PortalError(409, "Choose a shorter commitments range.");
  const readable = await tx.platformPost.findMany({
    where: {
      AND: [
        { id: { in: rows.map((r) => r.slot.postId) } },
        postReadableWhere(context)
      ]
    },
    select: { id: true }
  });
  const visible = new Set(readable.map((p) => p.id));
  return rows.map((r) => {
    const event = r.slot.post.eventOccurrence!;
    const allowed = visible.has(r.slot.postId);
    return {
      id: r.id,
      version: r.version,
      role: allowed ? r.slot.role : "Unavailable volunteer commitment",
      postId: allowed ? r.slot.postId : null,
      event: allowed
        ? {
            id: event.id,
            title: event.title,
            organizer: event.organizer,
            startAt: event.startAt.toISOString(),
            endAt: event.endAt.toISOString(),
            timeZone: event.timeZone,
            allDay: event.allDay,
            startLocal: event.startLocal,
            endLocal: event.endLocal,
            canceled: !!event.canceledAt || !!event.event.canceledAt
          }
        : null,
      detailsChanged:
        allowed &&
        (r.eventVersion !== event.event.version ||
          r.occurrenceVersion !== event.version),
      // Internal only: caller uses this for private overlap hints, then omits it.
      occurrence: allowed ? event : null
    };
  });
}
