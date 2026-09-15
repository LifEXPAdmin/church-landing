import { domainNotificationKinds } from "./domain-notification-source";
import { Prisma, type PrismaClient, type SocialEvent } from "@prisma/client";
import { withAccountRead } from "./account-read";
import { eligibleWhere, PortalError } from "./portal-policy";
import { postContext, type PostContext } from "./post-access";
import { socialCommand, socialInput } from "./social-operations";
import { postId } from "./post-input";
import { notificationSources } from "./notification-source";
import {
  activityCategories,
  type ActivityCategory,
  type ActivityPage
} from "./activity-types";

type Tx = Prisma.TransactionClient;
const kinds = [
  ...domainNotificationKinds,
  "ADULT_MESSAGE_CREATED",
  "ADULT_REQUEST_CREATED",
  "ADULT_REQUEST_ACCEPTED",
  "COMMENT_ACTIVITY",
  "REPORT_RECEIVED",
  "REPORT_RECONSIDERATION",
  "CONTENT_DECISION"
];
const PAGE_SIZE = 20;
type Position = { owner: string; through: string; after?: string };
const sequence = (v: unknown) => {
  if (
    typeof v !== "string" ||
    !/^(0|[1-9][0-9]{0,18})$/.test(v) ||
    BigInt(v) > BigInt("9223372036854775807")
  )
    throw new PortalError(400, "Refresh activity to get a valid position.");
  return BigInt(v);
};
const position = (value: Position) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
function parsePosition(
  value: unknown,
  owner: string,
  cursor = false
): Position {
  try {
    if (
      typeof value !== "string" ||
      value.length > 400 ||
      !/^[A-Za-z0-9_-]+$/.test(value)
    )
      throw Error();
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      !parsed ||
      Object.keys(parsed).sort().join() !==
        (cursor ? "after,owner,through" : "owner,through")
    )
      throw Error();
    if (parsed.owner !== owner)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload activity before continuing."
      );
    const through = sequence(parsed.through);
    if (
      cursor &&
      (sequence(parsed.after) > through || sequence(parsed.after) === BigInt(0))
    )
      throw Error();
    return parsed;
  } catch (error) {
    if (error instanceof PortalError) throw error;
    throw new PortalError(400, "Refresh activity to get a valid position.");
  }
}
const count = (v: bigint) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new PortalError(503, "Your activity needs a size review.");
  return n;
};
async function requireOwner(tx: Tx, owner: string | null) {
  if (!owner) throw new PortalError(401, "Sign in to see your activity.");
  if (
    !(await tx.platformUser.findFirst({
      where: { id: owner, ...eligibleWhere },
      select: { id: true }
    }))
  )
    throw new PortalError(
      403,
      "Verify your email and complete adult account setup to see activity."
    );
  return owner;
}
async function currentBoundary(tx: Tx, ownerId: string) {
  return (
    (
      await tx.socialEvent.findFirst({
        where: { recipientId: ownerId, kind: { in: kinds } },
        orderBy: { activitySequence: "desc" },
        select: { activitySequence: true }
      })
    )?.activitySequence ?? BigInt(0)
  );
}
const categorySql = Prisma.sql`CASE
  WHEN e.kind = 'ADULT_MESSAGE_CREATED' AND m.kind = 'FOUNDER_ANNOUNCEMENT' THEN 'founder'
  WHEN e.kind = 'ADULT_MESSAGE_CREATED' THEN 'messages'
  WHEN e.kind IN ('ADULT_REQUEST_CREATED','ADULT_REQUEST_ACCEPTED') THEN 'requests'
  WHEN e.kind = 'AUTHOR_POST' THEN 'posts'
  WHEN e.kind IN ('POST_REACTION','COMMENT_REACTION') THEN 'reactions'
  WHEN e.kind = 'PRAYER_ACK' OR (e.kind='COMMENT_ACTIVITY' AND e."notificationCategory"='prayer') THEN 'prayer'
  WHEN e.kind IN ('CHURCH_REVIEW','CHURCH_CONNECTION') THEN 'church'
  WHEN e.kind IN ('EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CHANGED','VOLUNTEER_CONFIRMATION') THEN 'commitments'
  WHEN e.kind = 'COMMENT_ACTIVITY' THEN 'comments' ELSE 'reports' END`;
const groupSql = Prisma.sql`CASE
  WHEN e.kind='AUTHOR_POST' THEN 'author:' || coalesce(p."authorChurchId",e."actorId")
  WHEN e.kind IN ('POST_REACTION','COMMENT_REACTION','PRAYER_ACK') THEN 'reaction:' || coalesce(e."commentId",e."postId",e.id)
  WHEN e.kind IN ('CHURCH_REVIEW','CHURCH_CONNECTION','EVENT_CHANGED','RSVP_CHANGED','VOLUNTEER_CHANGED','VOLUNTEER_CONFIRMATION') THEN e.kind || ':' || coalesce(e."sourceId",e.id)
  WHEN e.kind = 'ADULT_MESSAGE_CREATED' THEN 'conversation:' || coalesce(e."conversationId", e.id)
  WHEN e.kind IN ('ADULT_REQUEST_CREATED','ADULT_REQUEST_ACCEPTED') THEN 'request:' || coalesce(e."requestId", e.id)
  WHEN e.kind = 'COMMENT_ACTIVITY' THEN 'post:' || coalesce(e."postId", e.id)
  WHEN e.kind = 'CONTENT_DECISION' THEN 'decision:' || coalesce(e."decisionId", e.id)
  ELSE 'report:' || coalesce(e."reportId", e.id) END`;
function notMuted(user: Prisma.Sql, church: Prisma.Sql, context: PostContext) {
  return Prisma.sql`((${church} IS NULL AND ${context.mutedIds?.length ? Prisma.sql`${user} NOT IN (${Prisma.join(context.mutedIds)})` : Prisma.sql`TRUE`}) OR
    (${church} IS NOT NULL AND ${context.mutedChurchIds?.length ? Prisma.sql`${church} NOT IN (${Prisma.join(context.mutedChurchIds)})` : Prisma.sql`TRUE`}))`;
}
async function activityRows(tx: Tx, ownerId: string, through: bigint) {
  const preferences = await tx.socialPreferences.findUnique({
    where: { ownerId }
  });
  const context = await postContext(tx, ownerId);
  const sql = Prisma.sql`
    SELECT e.id, e."activitySequence" AS sequence, e."activityReadAt" AS "readAt", ${categorySql} AS category, ${groupSql} AS "groupKey",
      CASE WHEN e."activityReadAt" IS NULL AND e."activitySequence" > ${preferences?.activityReadThrough ?? BigInt(0)}
        AND (e.kind <> 'ADULT_MESSAGE_CREATED' OR m.id IS NULL OR m.sequence > coalesce(s."readThrough",0)) THEN 1 ELSE 0 END AS unread
    FROM "SocialEvent" e
    LEFT JOIN "AdultMessage" m ON e.kind = 'ADULT_MESSAGE_CREATED' AND m.id = e."messageId" AND m."conversationId" = e."conversationId" AND m."senderId" = e."actorId"
    LEFT JOIN "AdultConversationState" s ON s."conversationId" = e."conversationId" AND s."ownerId" = ${ownerId}
    LEFT JOIN "PlatformPostComment" c ON e.kind = 'COMMENT_ACTIVITY' AND c.id = e."commentId" AND c."postId" = e."postId" AND c."authorId" = e."actorId"
    LEFT JOIN "PlatformPost" p ON p.id = e."postId"
    LEFT JOIN "ConversationPreference" cp ON e.kind = 'COMMENT_ACTIVITY' AND cp."postId" = e."postId" AND cp."ownerId" = ${ownerId}
    WHERE e."recipientId" = ${ownerId} AND e.kind IN (${Prisma.join(kinds)}) AND e."activitySequence" <= ${through}
      AND ${!preferences?.notificationRecoveryRequired}
      AND NOT (coalesce(e."notificationCategory", CASE WHEN e.kind='COMMENT_ACTIVITY' THEN 'replies' ELSE '' END) = ANY(${preferences?.mutedNotificationCategories ?? []}::text[]))
      AND (e.kind NOT IN ('ADULT_REQUEST_CREATED','ADULT_REQUEST_ACCEPTED') OR ${preferences?.requestAlerts ?? true})
      AND (e.kind NOT IN ('REPORT_RECEIVED','REPORT_RECONSIDERATION','CONTENT_DECISION') OR ${preferences?.reportAlerts ?? true})
      AND (e.kind <> 'ADULT_MESSAGE_CREATED' OR (
        CASE WHEN m.kind = 'FOUNDER_ANNOUNCEMENT' THEN ${preferences?.founderAnnouncements ?? true} ELSE ${preferences?.messageAlerts ?? true} END
        AND coalesce(s.muted,false) = false AND (m.id IS NULL OR m.sequence > coalesce(s."hiddenThrough",0))))
      AND (e.kind <> 'COMMENT_ACTIVITY' OR (coalesce(cp.mode,'DEFAULT') <> 'MUTE'
        AND (c.id IS NULL OR ${notMuted(Prisma.sql`c."authorId"`, Prisma.sql`c."authorChurchId"`, context)})
        AND (p.id IS NULL OR ${notMuted(Prisma.sql`p."authorId"`, Prisma.sql`p."authorChurchId"`, context)})))`;
  return {
    sql,
    context,
    readThrough: preferences?.activityReadThrough ?? BigInt(0)
  };
}

// Presentation metadata is fetched only for sources already authorized in this
// same read transaction. Outbound delivery keeps its generic metadata-only path.
async function activitySummaries(
  tx: Tx,
  events: SocialEvent[],
  sources: Awaited<ReturnType<typeof notificationSources>>
) {
  const available = events.filter((e) => sources.has(e.id));
  const adults = available.filter((e) => e.kind.startsWith("ADULT_"));
  const comments = available.filter(
    (e) => e.kind === "COMMENT_ACTIVITY" && e.commentId
  );
  const people = new Map(
    (adults.length
      ? await tx.platformUser.findMany({
          where: { id: { in: adults.map((e) => e.actorId) } },
          select: { id: true, name: true },
          take: PAGE_SIZE
        })
      : []
    ).map((p) => [p.id, p.name])
  );
  const speakers = new Map(
    (comments.length
      ? await tx.platformPostComment.findMany({
          where: { id: { in: comments.map((e) => e.commentId!) } },
          select: {
            id: true,
            author: { select: { name: true } },
            authorChurch: { select: { name: true } }
          },
          take: PAGE_SIZE
        })
      : []
    ).map((c) => [c.id, c.authorChurch?.name ?? c.author.name])
  );
  return new Map(
    available.map((e) => [
      e.id,
      e.kind === "AUTHOR_POST"
        ? "A new post from an author whose bell you enabled"
        : ["POST_REACTION", "COMMENT_REACTION"].includes(e.kind)
          ? "Reactions to your post or comment"
          : e.kind === "PRAYER_ACK"
            ? "Prayer acknowledgments on your post or comment"
            : e.kind === "CHURCH_REVIEW"
              ? "A church connection request within your review access"
              : e.kind === "CHURCH_CONNECTION"
                ? "Your church connection changed"
                : e.kind === "EVENT_CHANGED"
                  ? "An event in your commitments changed"
                  : e.kind === "RSVP_CHANGED"
                    ? "Your event response was saved"
                    : ["VOLUNTEER_CHANGED", "VOLUNTEER_CONFIRMATION"].includes(
                          e.kind
                        )
                      ? "An update to your volunteer commitment"
                      : e.kind === "COMMENT_ACTIVITY"
                        ? `Latest from ${speakers.get(e.commentId!)}`
                        : e.kind === "CONTENT_DECISION"
                          ? "A private decision about your content"
                          : [
                                "REPORT_RECEIVED",
                                "REPORT_RECONSIDERATION"
                              ].includes(e.kind)
                            ? "Within your current reviewer access"
                            : `With ${people.get(e.actorId)}`
    ])
  );
}

export function readActivity(
  db: PrismaClient,
  token: unknown,
  options: { category?: unknown; cursor?: unknown } = {}
): Promise<ActivityPage> {
  return withAccountRead(db, token, async (tx, userId) => {
    const ownerId = await requireOwner(tx, userId);
    if (
      options.category != null &&
      !activityCategories.includes(options.category as ActivityCategory)
    )
      throw new PortalError(400, "Choose an available activity category.");
    const latest = await currentBoundary(tx, ownerId);
    const cursor =
      options.cursor != null
        ? parsePosition(options.cursor, ownerId, true)
        : null;
    const through = cursor ? sequence(cursor.through) : latest;
    if (through > latest)
      throw new PortalError(409, "Activity changed. Refresh to continue.");
    const {
      sql: rows,
      context,
      readThrough
    } = await activityRows(tx, ownerId, through);
    const totals = await tx.$queryRaw<Array<{ unread: bigint }>>(
      Prisma.sql`SELECT coalesce(sum(unread),0)::bigint AS unread FROM (${rows}) activity WHERE sequence > ${readThrough} AND "readAt" IS NULL`
    );
    const groups = await tx.$queryRaw<
      Array<{
        category: ActivityCategory;
        latest: bigint;
        count: bigint;
        unread: bigint;
      }>
    >(Prisma.sql`
      SELECT category, max(sequence) AS latest, count(*) AS count, sum(unread)::bigint AS unread
      FROM (${rows}) activity ${options.category ? Prisma.sql`WHERE category = ${options.category as string}` : Prisma.empty}
      GROUP BY category, "groupKey" ${cursor ? Prisma.sql`HAVING max(sequence) < ${sequence(cursor.after)}` : Prisma.empty}
      ORDER BY max(sequence) DESC LIMIT ${PAGE_SIZE + 1}`);
    const page = groups.slice(0, PAGE_SIZE);
    const events = page.length
      ? await tx.socialEvent.findMany({
          where: {
            recipientId: ownerId,
            activitySequence: { in: page.map((g) => g.latest) }
          },
          take: PAGE_SIZE
        })
      : [];
    const bySequence = new Map(events.map((e) => [e.activitySequence, e]));
    const sources = await notificationSources(
      tx,
      events,
      false,
      new Date(),
      context
    );
    const summaries = await activitySummaries(tx, events, sources);
    return {
      ownerId,
      boundary: position({ owner: ownerId, through: through.toString() }),
      nextCursor:
        groups.length > PAGE_SIZE
          ? position({
              owner: ownerId,
              through: through.toString(),
              after: page[page.length - 1].latest.toString()
            })
          : null,
      unread: count(totals[0].unread),
      categories: activityCategories,
      items: page.map((g) => {
        const event = bySequence.get(g.latest)!;
        const source = sources.get(event.id);
        return {
          id: event.id,
          category: g.category,
          createdAt: event.createdAt.toISOString(),
          count: count(g.count),
          unread: count(g.unread),
          available: !!source,
          summary: source ? (summaries.get(event.id) ?? null) : null,
          href: source?.href ?? null
        };
      })
    };
  });
}

export function openActivity(db: PrismaClient, token: unknown, id: unknown) {
  return withAccountRead(db, token, async (tx, userId) => {
    const ownerId = await requireOwner(tx, userId);
    const event = await tx.socialEvent.findFirst({
      where: { id: postId(id), recipientId: ownerId, kind: { in: kinds } }
    });
    if (!event) throw new PortalError(404, "This activity is unavailable.");
    const source = (await notificationSources(tx, [event], false)).get(
      event.id
    );
    return { ownerId, href: source?.href ?? null, available: !!source };
  });
}

export function activityCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, ["operation", "ownerId", "mutationId", "boundary", "id"]);
  if (
    !["read", "read-all"].includes(input.operation as string) ||
    (input.operation === "read-all" && input.id !== undefined)
  )
    throw new PortalError(400, "Choose a supported activity action.");
  return socialCommand(
    db,
    token,
    "activity",
    input,
    async (tx, ownerId) => {
      const boundary = parsePosition(input.boundary, ownerId);
      const through = sequence(boundary.through);
      if (through > (await currentBoundary(tx, ownerId)))
        throw new PortalError(
          409,
          "Activity changed. Refresh before marking it as read."
        );
      if (input.operation === "read-all") {
        const prior = await tx.socialPreferences.findUnique({
          where: { ownerId },
          select: { activityReadThrough: true }
        });
        if (!prior || prior.activityReadThrough < through)
          await tx.socialPreferences.upsert({
            where: { ownerId },
            create: { ownerId, activityReadThrough: through },
            update: { activityReadThrough: through }
          });
      } else {
        const id = postId(input.id);
        const { sql: rows } = await activityRows(tx, ownerId, through);
        const target = await tx.$queryRaw<
          Array<{ groupKey: string; category: ActivityCategory }>
        >(
          Prisma.sql`SELECT "groupKey", category FROM (${rows}) activity WHERE id = ${id}`
        );
        if (!target.length)
          throw new PortalError(
            404,
            "This activity is unavailable. Refresh before continuing."
          );
        await tx.$executeRaw(Prisma.sql`UPDATE "SocialEvent" e SET "activityReadAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        WHERE e."recipientId" = ${ownerId} AND e."activityReadAt" IS NULL AND e.id IN (
          SELECT id FROM (${rows}) activity WHERE "groupKey" = ${target[0].groupKey} AND category = ${target[0].category})`);
      }
      return { id: ownerId, version: 0, message: "Activity marked as read." };
    },
    async (tx, ownerId) => {
      if (input.ownerId !== ownerId)
        throw new PortalError(
          401,
          "Your sign-in changed. Reload activity before continuing."
        );
      await requireOwner(tx, ownerId);
    }
  );
}
