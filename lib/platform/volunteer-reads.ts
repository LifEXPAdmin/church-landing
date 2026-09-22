import type { Prisma, PrismaClient } from "@prisma/client";
import {
  withPostRead,
  postReadableWhere,
  type PostContext,
  type PostTx
} from "./post-access";
import {
  canParticipate,
  participationInclude,
  participationPost
} from "./post-participation";
import { postField, postId } from "./post-input";
import { PortalError } from "./portal-policy";
import { volunteerShift } from "./volunteer-shift";
import {
  opportunitySource,
  requireOpportunityCoordinator,
  volunteerApplicantWhere,
  canCoordinateOpportunity
} from "./volunteer-policy";

const PAGE = 25;
const applicationInclude = {
  signup: true,
  events: {
    orderBy: { version: "desc" },
    take: 20,
    select: { version: true, action: true, createdAt: true, note: true }
  }
} as const;
type Application = Prisma.VolunteerApplicationGetPayload<{
  include: typeof applicationInclude;
}>;
type Source = Awaited<ReturnType<typeof opportunitySource>>;
async function opportunityView(
  tx: PostTx,
  source: Source,
  filledCount?: number
) {
  const { row, post } = source;
  const time =
    row.slot && post.eventOccurrence
      ? volunteerShift(row.slot, post.eventOccurrence)
      : null;
  const filled =
    filledCount ??
    (row.slotId
      ? await tx.postVolunteerSignup.count({
          where: {
            slotId: row.slotId,
            OR: [{ state: "ACTIVE" }, { completedAt: { not: null } }]
          }
        })
      : await tx.volunteerApplication.count({
          where: { opportunityId: row.id, state: "ACCEPTED" }
        }));
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    duties: row.duties,
    requirements: row.requirements,
    contact: row.contact,
    commitment: row.commitment,
    postId: post.id,
    postVersion: post.version,
    churchId: post.authorChurchId!,
    slotId: row.slotId,
    slotVersion: row.slot?.version ?? null,
    capacity: row.slot?.capacity ?? row.capacity!,
    filled,
    closed:
      !!row.closedAt ||
      !!row.slot?.closedAt ||
      !!post.eventOccurrence?.canceledAt ||
      !!post.eventOccurrence?.event.canceledAt ||
      !!time?.conflict ||
      !!(time && time.endAt <= new Date()),
    applicationsClosed: !!row.closedAt,
    shift: time
      ? {
          ...time,
          startAt: time.startAt.toISOString(),
          endAt: time.endAt.toISOString()
        }
      : null,
    eventVersion: row.slot
      ? (post.eventOccurrence?.event.version ?? null)
      : null,
    occurrenceVersion: row.slot
      ? (post.eventOccurrence?.version ?? null)
      : null,
    eventId: row.slot ? post.eventOccurrenceId : null
  };
}
export type VolunteerOpportunityView = Awaited<
  ReturnType<typeof opportunityView>
>;

function applicationView(
  row: Application,
  source: Source | null,
  context: PostContext
) {
  const current = !!source && !row.recoveryRequired;
  const signup = row.signup;
  const history = current ? row.events : [];
  const detailsChanged =
    !!source &&
    (row.opportunityVersion !== source.row.version ||
      row.slotVersion !== (source.row.slot?.version ?? null) ||
      row.eventVersion !==
        (source.row.slot
          ? (source.post.eventOccurrence?.event.version ?? null)
          : null) ||
      row.occurrenceVersion !==
        (source.row.slot
          ? (source.post.eventOccurrence?.version ?? null)
          : null));
  return {
    id: row.id,
    version: row.version,
    own: row.userId === context.actorId,
    current,
    state:
      row.state === "ACCEPTED" && signup?.state === "CANCELED"
        ? ("WITHDRAWN" as const)
        : row.state,
    statement: current ? row.statement : "",
    decisionNote: current ? row.decisionNote : "",
    title: current ? source!.row.title : "Unavailable volunteer opportunity",
    opportunityId: current ? row.opportunityId : null,
    detailsChanged,
    completed: !!signup?.completedAt,
    canWithdraw:
      row.userId === context.actorId &&
      !signup?.completedAt &&
      ["SUBMITTED", "ACCEPTED"].includes(row.state),
    history: history
      .toReversed()
      .map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }))
  };
}
export type VolunteerApplicationView = Awaited<
  ReturnType<typeof applicationView>
>;

export function readVolunteerOpportunity(
  db: PrismaClient,
  token: unknown,
  id: string,
  editing = false
) {
  return withPostRead(db, token, async (tx, context) => {
    const source = await opportunitySource(tx, context, id);
    if (editing) requireOpportunityCoordinator(context, source.post, true);
    const eligible = await canParticipate(tx, context, source.post);
    const own = context.actorId
      ? await tx.volunteerApplication.findUnique({
          where: {
            opportunityId_userId: {
              opportunityId: source.row.id,
              userId: context.actorId
            }
          },
          include: applicationInclude
        })
      : null;
    let canEdit = false;
    try {
      requireOpportunityCoordinator(context, source.post, true);
      canEdit = true;
    } catch (error) {
      if (!(error instanceof PortalError)) throw error;
    }
    return {
      ownerId: context.actorId,
      eligible,
      canEdit,
      canReview: canCoordinateOpportunity(context, source.post),
      parentEvent: source.post.eventOccurrence
        ? {
            startLocal: source.post.eventOccurrence.startLocal,
            endLocal: source.post.eventOccurrence.endLocal,
            timeZone: source.post.eventOccurrence.timeZone
          }
        : null,
      opportunity: await opportunityView(tx, source),
      application: own
        ? applicationView(own, eligible ? source : null, context)
        : null
    };
  });
}

export function volunteerEditorContext(
  db: PrismaClient,
  token: unknown,
  postIdValue: string
) {
  return withPostRead(db, token, async (tx, context) => {
    const post = await participationPost(tx, context, postIdValue);
    requireOpportunityCoordinator(context, post, true);
    return {
      ownerId: context.actorId!,
      postId: post.id,
      postVersion: post.version,
      event: post.eventOccurrence
        ? {
            id: post.eventOccurrence.id,
            title: post.eventOccurrence.title,
            timeZone: post.eventOccurrence.timeZone,
            allDay: post.eventOccurrence.allDay,
            startLocal: post.eventOccurrence.startLocal,
            endLocal: post.eventOccurrence.endLocal,
            startAt: post.eventOccurrence.startAt.toISOString(),
            endAt: post.eventOccurrence.endAt.toISOString()
          }
        : null
    };
  });
}

export function listVolunteerOpportunities(
  db: PrismaClient,
  token: unknown,
  query: { after?: string | null; churchId?: string | null; q?: string | null }
) {
  return withPostRead(db, token, async (tx, context) => {
    const q = postField(query.q ?? "", 70, 0);
    const rows = await tx.volunteerOpportunity.findMany({
      where: {
        recoveryRequired: false,
        closedAt: null,
        ...(query.after ? { id: { gt: postId(query.after) } } : {}),
        ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
        post: {
          AND: [
            postReadableWhere(context),
            {
              authorChurchId: query.churchId
                ? postId(query.churchId)
                : { not: null }
            }
          ]
        }
      },
      include: { slot: true, post: { include: participationInclude } },
      orderBy: { id: "asc" },
      take: PAGE + 1
    });
    const page = rows.slice(0, PAGE);
    const [timed, ongoing] = await Promise.all([
      tx.postVolunteerSignup.groupBy({
        by: ["slotId"],
        where: {
          slotId: {
            in: page.flatMap((row) => (row.slotId ? [row.slotId] : []))
          },
          OR: [{ state: "ACTIVE" }, { completedAt: { not: null } }]
        },
        _count: true
      }),
      tx.volunteerApplication.groupBy({
        by: ["opportunityId"],
        where: {
          opportunityId: {
            in: page.filter((row) => !row.slotId).map((row) => row.id)
          },
          state: "ACCEPTED"
        },
        _count: true
      })
    ]);
    const counts = new Map([
      ...timed.map((row) => [row.slotId, row._count] as const),
      ...ongoing.map((row) => [row.opportunityId, row._count] as const)
    ]);
    const items = [];
    for (const row of rows.slice(0, PAGE)) {
      if (!row.post) continue;
      items.push(
        await opportunityView(
          tx,
          { row, post: row.post },
          counts.get(row.slotId ?? row.id) ?? 0
        )
      );
    }
    return {
      ownerId: context.actorId,
      q,
      churchId: query.churchId ?? null,
      items,
      nextCursor: rows.length > PAGE ? rows[PAGE - 1].id : null
    };
  });
}

export function readVolunteerApplications(
  db: PrismaClient,
  token: unknown,
  query: { opportunityId?: string | null; after?: string | null }
) {
  return withPostRead(db, token, async (tx, context) => {
    if (!context.actorId)
      throw new PortalError(
        401,
        "Sign in to view your volunteer applications."
      );
    const source = query.opportunityId
      ? await opportunitySource(tx, context, query.opportunityId)
      : null;
    if (source) requireOpportunityCoordinator(context, source.post);
    const where: Prisma.VolunteerApplicationWhereInput = source
      ? {
          opportunityId: source.row.id,
          userId: { notIn: context.blockedIds ?? [] },
          recoveryRequired: false,
          user: { is: volunteerApplicantWhere(source) }
        }
      : { userId: context.actorId };
    const rows = await tx.volunteerApplication.findMany({
      where: {
        ...where,
        ...(query.after ? { id: { gt: postId(query.after) } } : {})
      },
      include: { ...applicationInclude, user: { select: { name: true } } },
      orderBy: { id: "asc" },
      take: PAGE + 1
    });
    const items = [];
    for (const row of rows.slice(0, PAGE)) {
      let currentSource: Source | null = null;
      try {
        if (source) currentSource = source;
        else if (row.opportunityId) {
          const found = await opportunitySource(tx, context, row.opportunityId);
          if (await canParticipate(tx, context, found.post))
            currentSource = found;
        }
      } catch (error) {
        if (!(error instanceof PortalError && error.status === 404))
          throw error;
      }
      if (source && !currentSource) continue;
      items.push({
        ...applicationView(row, currentSource, context),
        applicantName:
          source && currentSource
            ? (row.user?.name ?? "Unavailable account")
            : null
      });
    }
    return {
      ownerId: context.actorId,
      opportunity: source ? await opportunityView(tx, source) : null,
      items,
      nextCursor: rows.length > PAGE ? rows[PAGE - 1].id : null
    };
  });
}

export type VolunteerQuery = {
  view?: string;
  id?: string | null;
  postId?: string | null;
  after?: string | null;
  churchId?: string | null;
  q?: string | null;
};
export async function readVolunteers(
  db: PrismaClient,
  token: unknown,
  query: VolunteerQuery
) {
  switch (query.view ?? "list") {
    case "list":
      return {
        view: "list" as const,
        ...(await listVolunteerOpportunities(db, token, query))
      };
    case "opportunity":
      return {
        view: "opportunity" as const,
        ...(await readVolunteerOpportunity(db, token, postId(query.id)))
      };
    case "edit":
      return {
        view: "edit" as const,
        ...(await readVolunteerOpportunity(db, token, postId(query.id), true))
      };
    case "new":
      return {
        view: "new" as const,
        ...(await volunteerEditorContext(db, token, postId(query.postId)))
      };
    case "applications":
      return {
        view: "applications" as const,
        ...(await readVolunteerApplications(db, token, {
          opportunityId: query.id,
          after: query.after
        }))
      };
    default:
      throw new PortalError(400, "Use the current volunteer navigation.");
  }
}
