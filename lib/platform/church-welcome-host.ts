import { Prisma, type PrismaClient } from "@prisma/client";
import { withPostRead } from "./post-access";
import { eligibleWhere, PortalError } from "./portal-policy";
import { postId } from "./post-input";
import { commentVisibleWhere } from "./comment-policy";
import {
  churchWelcomePosts,
  currentChurchWelcome,
  requireWelcomeMember,
  welcomePostSelect,
  welcomePostLink
} from "./church-welcome-policy";

export function welcomeDateRange(
  fromValue?: unknown,
  untilValue?: unknown,
  now = new Date()
) {
  const from =
      fromValue ??
      new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10),
    until =
      untilValue ??
      new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  const valid = (v: unknown): v is string =>
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v;
  if (
    !valid(from) ||
    !valid(until) ||
    Date.parse(until) <= Date.parse(from) ||
    Date.parse(until) - Date.parse(from) > 92 * 86400000
  )
    throw new PortalError(
      400,
      "Choose a start date and a later end date, at most 92 days apart."
    );
  return { from, until, start: new Date(from), end: new Date(until) };
}
export function readChurchWelcomeHost(
  db: PrismaClient,
  token: unknown,
  input: {
    churchId: unknown;
    from?: unknown;
    until?: unknown;
    after?: unknown;
    queue?: unknown;
  }
) {
  const churchId = postId(input.churchId),
    range = welcomeDateRange(input.from, input.until),
    after = input.after ? postId(input.after) : undefined;
  const queue = input.queue ?? "unanswered";
  if (queue !== "unanswered" && queue !== "handled")
    throw new PortalError(400, "Choose unanswered or handled threads.");
  return withPostRead(db, token, async (tx, context) => {
    await requireWelcomeMember(tx, context, churchId);
    const canPublish = context.publishers.has(churchId);
    let host = false;
    try {
      await requireWelcomeMember(tx, context, churchId, true);
      host = true;
    } catch (error) {
      if (!(error instanceof PortalError) || error.status !== 403) throw error;
    }
    if (!host && !canPublish)
      throw new PortalError(
        403,
        "A current church publisher or welcome host permission is required."
      );
    const church = await tx.church.findUniqueOrThrow({
      where: { id: churchId },
      select: {
        id: true,
        name: true,
        welcomePostId: true,
        welcomeVersion: true
      }
    });
    const scope = churchWelcomePosts(context, churchId),
      date = { gte: range.start, lt: range.end };
    const choices = canPublish
      ? await tx.platformPost.findMany({
          where: { AND: [scope, { authorChurchId: churchId }] },
          select: welcomePostSelect,
          orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
          take: 31
        })
      : [];
    const welcome = await currentChurchWelcome(
      tx,
      context,
      churchId,
      church.welcomePostId
    );
    let threads: Array<{
      postId: string;
      purpose: string;
      version: number;
      handled: boolean;
      post: {
        id: string;
        content: string;
        contentNote: string | null;
        safeExcerpt: string | null;
      };
    }> = [];
    let totals = null;
    let nextCursor: string | null = null;
    if (host) {
      // An author's own reply is not an answer. Read a bounded candidate page
      // and advance even when every candidate already has a visible response.
      const candidates = await tx.churchWelcomeThread.findMany({
        where: {
          churchId,
          purpose: { in: ["INTRODUCTION", "QUESTION"] },
          handled: queue === "handled",
          ...(after ? { postId: { gt: after } } : {}),
          post: scope
        },
        orderBy: { postId: "asc" },
        take: 101,
        select: {
          postId: true,
          purpose: true,
          version: true,
          handled: true,
          post: { select: welcomePostSelect }
        }
      });
      const page = candidates.slice(0, 100),
        blocked = context.blockedIds ?? [];
      // Same visible-comment predicate as commentVisibleWhere; only bounded,
      // already-authorized source IDs enter this query. No reply text is read.
      const answered =
        queue === "unanswered" && page.length
          ? await tx.$queryRaw<Array<{ postId: string }>>(Prisma.sql`
        SELECT DISTINCT c."postId" FROM "PlatformPostComment" c
        JOIN "PlatformPost" p ON p.id=c."postId"
        WHERE c."postId" IN (${Prisma.join(page.map((p) => p.postId))})
          AND c."deletedAt" IS NULL AND c."moderationState"='VISIBLE'
          AND (c."topicCommunityId" IS NULL OR EXISTS (SELECT 1 FROM "TopicMembership" tm
            WHERE tm."communityId"=c."topicCommunityId" AND tm."userId"=c."authorId" AND tm."restrictedAt" IS NULL))
          AND (c."authorChurchId" IS NOT NULL OR EXISTS (SELECT 1 FROM "PlatformUser" u
            WHERE u.id=c."authorId" AND u."suspendedAt" IS NULL AND u."deactivatedAt" IS NULL
            ${blocked.length ? Prisma.sql`AND u.id NOT IN (${Prisma.join(blocked)})` : Prisma.empty}))
          AND CASE WHEN c."authorChurchId" IS NOT NULL THEN c."authorChurchId" IS DISTINCT FROM p."authorChurchId"
            ELSE p."authorChurchId" IS NOT NULL OR c."authorId"<>p."authorId" END
      `)
          : [];
      const answeredIds = new Set(answered.map((c) => c.postId));
      const available = page.filter((t) => !answeredIds.has(t.postId));
      threads = available.slice(0, 20);
      nextCursor =
        available.length > 20
          ? threads[19].postId
          : candidates.length > 100
            ? page[99].postId
            : null;
      const participant: Prisma.PlatformUserWhereInput = {
        ...eligibleWhere,
        connections: { some: { churchId, state: "APPROVED" } }
      };
      const events: Prisma.CalendarOccurrenceWhereInput = {
        canceledAt: null,
        startAt: date,
        event: {
          canceledAt: null,
          visibility: { in: ["PUBLIC", "CHURCH"] },
          calendar: { churchId, archivedAt: null }
        }
      };
      const [posts, replies, ballots, responses, slots] = await Promise.all([
        tx.platformPost.count({
          where: { AND: [scope, { publishedAt: date }] }
        }),
        tx.platformPostComment.count({
          where: {
            AND: [
              commentVisibleWhere(context),
              { createdAt: date, post: scope }
            ]
          }
        }),
        tx.postPollBallot.count({
          where: { updatedAt: date, user: participant, poll: { post: scope } }
        }),
        tx.calendarResponse.groupBy({
          by: ["state"],
          where: { occurrence: events, user: participant },
          _count: { _all: true }
        }),
        tx.postVolunteerSlot.findMany({
          where: { post: { AND: [scope, { eventOccurrence: events }] } },
          select: {
            capacity: true,
            closedAt: true,
            _count: { select: { signups: { where: { state: "ACTIVE" } } } }
          },
          take: 1001
        })
      ]);
      if (slots.length > 1000)
        throw new PortalError(
          409,
          "Choose a shorter date range to show complete volunteer totals."
        );
      totals = {
        posts,
        replies,
        ballots,
        responses: responses.map((r) => ({
          state: r.state,
          count: r._count._all
        })),
        confirmedVolunteers: slots.reduce(
          (sum, s) => sum + s._count.signups,
          0
        ),
        openVolunteerPlaces: slots.reduce(
          (sum, s) =>
            sum + (s.closedAt ? 0 : Math.max(0, s.capacity - s._count.signups)),
          0
        )
      };
    }
    return {
      ownerId: context.actorId!,
      church: { id: church.id, name: church.name },
      canPublish,
      host,
      welcome,
      welcomeVersion: church.welcomeVersion,
      choices: choices.slice(0, 30).map(welcomePostLink),
      moreChoices: choices.length > 30,
      from: range.from,
      until: range.until,
      queue,
      threads: threads.map((t) => ({
        ...welcomePostLink(t.post),
        purpose: t.purpose,
        handled: t.handled,
        version: t.version
      })),
      nextCursor,
      totals
    };
  });
}
export type ChurchWelcomeHostView = Awaited<
  ReturnType<typeof readChurchWelcomeHost>
>;
