import {
  PlatformPostType,
  type PrismaClient,
  type PlatformPost,
  type PostAudience,
  type PostReplyAudience
} from "@prisma/client";
import { Temporal } from "@js-temporal/polyfill";
import { withOwnedSession } from "./account-sessions";
import { expected, PortalError } from "./portal";
import { calendarZone } from "./calendar-time";
import {
  postCanEdit,
  postCanModerate,
  postContext,
  postField,
  postId,
  type PostContext,
  type PostTx
} from "./post-access";

export const POST_TOPICS = [
  "prayer",
  "testimony",
  "scripture",
  "fasting",
  "worship",
  "service",
  "community",
  "family",
  "questions",
  "encouragement"
] as const;
function topics(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.length > 5 ||
    new Set(value).size !== value.length ||
    value.some((v) => !POST_TOPICS.includes(v as (typeof POST_TOPICS)[number]))
  )
    throw new PortalError(400, "Choose up to five different supported topics.");
  return value as string[];
}
function details(input: Record<string, unknown>) {
  const type = String(input.type ?? "UPDATE") as PlatformPostType;
  if (!Object.values(PlatformPostType).includes(type))
    throw new PortalError(400, "Choose a supported post category.");
  return {
    content: postField(input.content, 3000, 3),
    scripture: postField(input.scripture ?? "", 120) || null,
    topics: topics(input.topics ?? []),
    type
  };
}
function audience(value: unknown, churchId: string | null): PostAudience {
  if (value !== "PUBLIC" && value !== "CHURCH")
    throw new PortalError(400, "Choose Public or Church visibility.");
  if (value === "CHURCH" && !churchId)
    throw new PortalError(400, "Choose the church that may read this post.");
  return value;
}
function replies(value: unknown, churchId: string | null): PostReplyAudience {
  if (value !== "VIEWERS" && value !== "CHURCH_MEMBERS")
    throw new PortalError(400, "Choose who may reply.");
  if (value === "CHURCH_MEMBERS" && !churchId)
    throw new PortalError(
      400,
      "Choose a church before limiting replies to its members."
    );
  return value;
}
function boolean(value: unknown) {
  if (typeof value !== "boolean")
    throw new PortalError(400, "Choose an explicit on or off value.");
  return value;
}
async function audit(
  tx: PostTx,
  post: PlatformPost,
  actorId: string,
  action: string
) {
  await tx.postAudit.create({
    data: { postId: post.id, actorId, action, version: post.version }
  });
}
function publisher(context: PostContext, churchId: string) {
  if (!context.publishers.has(churchId))
    throw new PortalError(
      403,
      "An approved church publisher must perform this action. Refresh to check your current access."
    );
}
async function eventLink(
  tx: PostTx,
  context: PostContext,
  occurrenceId: string | null,
  churchId: string | null
) {
  if (!occurrenceId) return;
  const occurrence = await tx.calendarOccurrence.findUnique({
    where: { id: occurrenceId },
    include: { event: { include: { calendar: true } } }
  });
  if (
    !occurrence ||
    !churchId ||
    !context.churches.includes(churchId) ||
    occurrence.event.calendar.churchId !== churchId ||
    occurrence.event.calendar.archivedAt ||
    occurrence.canceledAt ||
    occurrence.event.canceledAt ||
    occurrence.event.visibility === "PRIVATE"
  )
    throw new PortalError(
      403,
      "Choose an active published event from this church. Private calendar information cannot be copied into a post."
    );
}
export function postSchedule(local: unknown, zone: unknown, now = new Date()) {
  const timeZone = calendarZone(zone);
  if (
    typeof local !== "string" ||
    !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)
  )
    throw new PortalError(400, "Choose a local publication date and time.");
  let instant: Date;
  try {
    instant = new Date(
      Temporal.PlainDateTime.from(local).toZonedDateTime(timeZone, {
        disambiguation: "reject"
      }).epochMilliseconds
    );
  } catch {
    throw new PortalError(
      400,
      "This local time is skipped or repeated, or is not a valid date. Choose an unambiguous time in the selected time zone."
    );
  }
  if (instant <= now || instant.getTime() > now.getTime() + 366 * 86400000)
    throw new PortalError(400, "Choose a publication time in the next year.");
  return { scheduleAt: instant, scheduleLocal: local, scheduleZone: timeZone };
}
export async function postCommandIn(
  tx: PostTx,
  context: PostContext,
  input: Record<string, unknown>
) {
  if (!context.actorId) throw new PortalError(401, "Sign in to continue.");
  if (input.authorId !== undefined)
    throw new PortalError(
      400,
      "The acting account comes from your current sign-in."
    );
  const actorId = context.actorId,
    op = input.operation,
    now = new Date();
  if (op === "create") {
    const authorChurchId = input.authorChurchId
      ? postId(input.authorChurchId)
      : null;
    const audienceChurchId = input.audienceChurchId
      ? postId(input.audienceChurchId)
      : authorChurchId;
    if (authorChurchId) {
      publisher(context, authorChurchId);
      if (audienceChurchId !== authorChurchId)
        throw new PortalError(400, "The author and sharing church must match.");
    }
    if (audienceChurchId && !context.churches.includes(audienceChurchId))
      throw new PortalError(
        403,
        "Only an approved member may deliberately share with this church."
      );
    const requestKey = postId(input.requestKey);
    const prior = await tx.platformPost.findUnique({
      where: { authorId_requestKey: { authorId: actorId, requestKey } }
    });
    if (prior) {
      if (!postCanEdit(context, prior))
        throw new PortalError(403, "This saved request is no longer editable.");
      return {
        id: prior.id,
        version: prior.version,
        message: "This post was already saved."
      };
    }
    const eventOccurrenceId = input.eventOccurrenceId
      ? postId(input.eventOccurrenceId)
      : null;
    await eventLink(tx, context, eventOccurrenceId, audienceChurchId);
    if (
      eventOccurrenceId &&
      (await tx.platformPost.findUnique({
        where: { eventOccurrenceId },
        select: { id: true }
      }))
    )
      throw new PortalError(
        409,
        "This event already has a discussion. Use its existing post."
      );
    const scheduled =
      input.scheduleLocal !== undefined &&
      input.scheduleLocal !== null &&
      input.scheduleLocal !== "";
    if (scheduled && !authorChurchId)
      throw new PortalError(
        403,
        "Scheduled publishing is available to authorized church publishers."
      );
    const schedule = scheduled
      ? postSchedule(input.scheduleLocal, input.scheduleZone, now)
      : {};
    const post = await tx.platformPost.create({
      data: {
        ...details(input),
        authorId: actorId,
        authorChurchId,
        audienceChurchId,
        requestKey,
        audience: audience(
          input.audience ?? (audienceChurchId ? "CHURCH" : "PUBLIC"),
          audienceChurchId
        ),
        replyAudience: replies(
          input.replyAudience ?? "VIEWERS",
          audienceChurchId
        ),
        allowReposts: boolean(input.allowReposts ?? false),
        eventOccurrenceId,
        scheduledById: scheduled ? actorId : null,
        status: scheduled ? "SCHEDULED" : "PUBLISHED",
        publishedAt: scheduled ? null : now,
        ...schedule
      }
    });
    await audit(tx, post, actorId, scheduled ? "scheduled" : "published");
    return {
      id: post.id,
      version: post.version,
      message: scheduled
        ? "The publication plan is saved. Durable worker activation is a separate step."
        : "Your post is published."
    };
  }
  const post = await tx.platformPost.findUnique({
    where: { id: postId(input.postId) }
  });
  if (!post) throw new PortalError(404, "Post unavailable.");
  if (
    !postCanEdit(context, post) &&
    !(
      (op === "withdraw" || op === "discussion") &&
      postCanModerate(context, post)
    )
  )
    throw new PortalError(
      403,
      "You cannot change this post. Refresh to check your current access."
    );
  expected(input.expectedVersion, post.version);
  if (post.status === "WITHDRAWN")
    throw new PortalError(409, "This post has been withdrawn.");
  if (op === "edit") {
    if (
      (input.authorChurchId !== undefined &&
        input.authorChurchId !== post.authorChurchId) ||
      (input.audienceChurchId !== undefined &&
        input.audienceChurchId !== post.audienceChurchId) ||
      (input.eventOccurrenceId !== undefined &&
        input.eventOccurrenceId !== post.eventOccurrenceId)
    )
      throw new PortalError(
        400,
        "Editing cannot change the author, sharing church or linked event."
      );
    const nextAudience = audience(
      input.audience ?? post.audience,
      post.audienceChurchId
    );
    if (nextAudience !== post.audience && input.confirmAudienceChange !== true)
      throw new PortalError(400, "Confirm the audience change before saving.");
    if (
      post.audienceChurchId &&
      !context.churches.includes(post.audienceChurchId)
    )
      throw new PortalError(
        403,
        "Church membership is required to edit this shared post."
      );
    const updated = await tx.platformPost.update({
      where: { id: post.id },
      data: {
        ...details({ ...post, ...input }),
        audience: nextAudience,
        allowReposts: boolean(input.allowReposts ?? post.allowReposts),
        editedAt: post.status === "PUBLISHED" ? now : post.editedAt,
        version: { increment: 1 }
      }
    });
    await audit(tx, updated, actorId, "edited");
    return {
      id: updated.id,
      version: updated.version,
      message: "Your changes are saved."
    };
  }
  if (op === "withdraw") {
    if (input.confirmed !== true)
      throw new PortalError(
        400,
        "Confirm that you want to remove this post and its discussion from view."
      );
    const updated = await tx.platformPost.update({
      where: { id: post.id },
      data: {
        status: "WITHDRAWN",
        withdrawnAt: now,
        discussionClosed: true,
        content: "",
        scripture: null,
        topics: [],
        pinUntil: null,
        scheduleAt: null,
        scheduleLocal: null,
        scheduleZone: null,
        version: { increment: 1 }
      }
    });
    await audit(tx, updated, actorId, "withdrawn");
    return {
      id: updated.id,
      version: updated.version,
      message: "The post and discussion are no longer available to readers."
    };
  }
  if (op === "discussion") {
    const updated = await tx.platformPost.update({
      where: { id: post.id },
      data: {
        discussionClosed: boolean(input.closed),
        replyAudience: replies(
          input.replyAudience ?? post.replyAudience,
          post.audienceChurchId
        ),
        version: { increment: 1 }
      }
    });
    await audit(tx, updated, actorId, "discussion-changed");
    return {
      id: updated.id,
      version: updated.version,
      message: "Discussion permissions are saved."
    };
  }
  if (op === "pin") {
    if (!post.authorChurchId || post.status !== "PUBLISHED")
      throw new PortalError(
        403,
        "Only published church-authored notices can be pinned."
      );
    publisher(context, post.authorChurchId);
    const until =
      input.until === null ? null : new Date(postField(input.until, 40, 1));
    if (
      until &&
      (!Number.isFinite(until.getTime()) ||
        until <= now ||
        until.getTime() > now.getTime() + 90 * 86400000)
    )
      throw new PortalError(
        400,
        "Choose a pin expiry within the next 90 days."
      );
    if (
      until &&
      (await tx.platformPost.count({
        where: {
          id: { not: post.id },
          authorChurchId: post.authorChurchId,
          status: "PUBLISHED",
          pinUntil: { gt: now }
        }
      })) >= 3
    )
      throw new PortalError(
        409,
        "A church can have up to three active pinned notices."
      );
    const updated = await tx.platformPost.update({
      where: { id: post.id },
      data: { pinUntil: until, version: { increment: 1 } }
    });
    await audit(tx, updated, actorId, until ? "pinned" : "unpinned");
    return {
      id: updated.id,
      version: updated.version,
      message: "The church notice pin is updated."
    };
  }
  if (op === "schedule" || op === "cancel-schedule") {
    if (!post.authorChurchId || !["DRAFT", "SCHEDULED"].includes(post.status))
      throw new PortalError(
        403,
        "Only an unpublished church post can be scheduled."
      );
    publisher(context, post.authorChurchId);
    const schedule =
      op === "schedule"
        ? postSchedule(input.scheduleLocal, input.scheduleZone, now)
        : { scheduleAt: null, scheduleLocal: null, scheduleZone: null };
    const updated = await tx.platformPost.update({
      where: { id: post.id },
      data: {
        ...schedule,
        scheduledById: op === "schedule" ? actorId : null,
        status: op === "schedule" ? "SCHEDULED" : "DRAFT",
        publishedAt: null,
        version: { increment: 1 }
      }
    });
    await audit(
      tx,
      updated,
      actorId,
      op === "schedule" ? "rescheduled" : "schedule-canceled"
    );
    return {
      id: updated.id,
      version: updated.version,
      message:
        op === "schedule"
          ? "The revised publication plan is saved."
          : "The publication plan is canceled; the private draft remains."
    };
  }
  throw new PortalError(400, "Choose a supported post action.");
}
export function postCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  return withOwnedSession(
    db,
    token,
    async (tx, session) =>
      postCommandIn(tx, await postContext(tx, session.userId), input),
    true
  );
}

// Called only by a trusted durable worker. A saved plan is not proof that a
// worker is configured; task 8 supplies dispatch/retries, using these versions.
export async function publishScheduledPost(
  db: PrismaClient,
  id: string,
  version: number,
  now = new Date()
) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      const post = await tx.platformPost.findUnique({
        where: { id: postId(id) }
      });
      if (
        !post ||
        post.status !== "SCHEDULED" ||
        post.version !== version ||
        !post.scheduleAt ||
        post.scheduleAt > now
      )
        return { published: false, changed: false };
      const context = await postContext(tx, post.scheduledById);
      let allowed =
        !!post.authorChurchId && context.publishers.has(post.authorChurchId);
      if (allowed) {
        try {
          await eventLink(
            tx,
            context,
            post.eventOccurrenceId,
            post.audienceChurchId
          );
        } catch (error) {
          if (!(error instanceof PortalError)) throw error;
          allowed = false;
        }
      }
      const updated = await tx.platformPost.update({
        where: { id: post.id },
        data: {
          status: allowed ? "PUBLISHED" : "DRAFT",
          publishedAt: allowed ? now : null,
          scheduleAt: null,
          scheduleLocal: null,
          scheduleZone: null,
          version: { increment: 1 }
        }
      });
      await audit(
        tx,
        updated,
        post.scheduledById ?? post.authorId,
        allowed ? "schedule-published" : "schedule-blocked"
      );
      return { published: allowed, changed: true };
    },
    { maxWait: 10000, timeout: 15000 }
  );
}
