import { setPostMentions } from "./person-mentions";
import { recordPostMentions, recordPostPublication } from "./domain-activity";
import { createHash } from "node:crypto";
import { postDiscoveryData } from "./post-discovery";
import { emptyPostDiscovery } from "./post-options";
import { recordDiscoveryControl } from "./retention-controls";
import { requireSocialActivity } from "./social-activity-limits";
import { requireTopicParticipation } from "./topic-policy";
import { topicAudit } from "./topic-communities";
import {
  discussionModerationReasons,
  discussionSettingsState
} from "./post-discussion-options";
import {
  originalForRepost,
  repostDestination,
  requireRepostActor
} from "./repost-policy";
import {
  attachPostPhotosIn,
  validatePostPhotosIn
} from "./post-photo-references";
import {
  PlatformPostType,
  type PrismaClient,
  type PlatformPost,
  type PostAudience,
  type PostReplyAudience
} from "@prisma/client";
import { Temporal } from "@js-temporal/polyfill";
import { withOwnedSession } from "./account-sessions";
import { expected, PortalError } from "./portal-policy";
import { calendarZone } from "./calendar-time";
import {
  postCanEdit,
  postCanWithdraw,
  postCanModerate,
  postContext,
  type PostContext,
  type PostTx
} from "./post-access";
import { postField, postId } from "./post-input";
import {
  selectedSourceReport,
  recordReportedWithdrawal
} from "./retention-controls";

import {
  POST_TOPICS,
  CONTENT_NOTE_LIMIT,
  SAFE_EXCERPT_LIMIT
} from "./post-options";
import { emptyPostLink, preparePostLink, type PostLink } from "./post-links";
import { socialCommand, socialKey } from "./social-operations";
export { POST_TOPICS } from "./post-options";
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
    contentNote: postField(input.contentNote ?? "", CONTENT_NOTE_LIMIT) || null,
    safeExcerpt: postField(input.safeExcerpt ?? "", SAFE_EXCERPT_LIMIT) || null,
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
  input: Record<string, unknown>,
  preparedLink?: PostLink
) {
  if (!context.actorId) throw new PortalError(401, "Sign in to continue.");
  if (input.authorId !== undefined)
    throw new PortalError(
      400,
      "The acting account comes from your current sign-in."
    );
  if (input.repostKind !== undefined || input.repostSourceId !== undefined)
    throw new PortalError(
      400,
      "Use the supported repost action or quote draft."
    );
  const actorId = context.actorId,
    op = input.operation,
    now = new Date();
  if (
    (op === "create" || op === "edit") &&
    input.linkUrl !== undefined &&
    !preparedLink
  )
    throw new PortalError(
      400,
      "Use the publishing form to add or change a link."
    );
  if (op === "create") {
    const topicCommunityId = input.topicCommunityId
      ? postId(input.topicCommunityId)
      : null;
    requireTopicParticipation(context, topicCommunityId);
    if (
      topicCommunityId &&
      (input.authorChurchId ||
        input.audienceChurchId ||
        input.eventOccurrenceId ||
        input.quoteSourceId ||
        input.scheduleLocal ||
        input.scheduleZone ||
        (input.audience !== undefined && input.audience !== "PUBLIC") ||
        (input.replyAudience !== undefined &&
          input.replyAudience !== "VIEWERS"))
    )
      throw new PortalError(
        400,
        "Topic posts are public personal discussions. Choose this topic without a church, event, schedule or quote destination."
      );
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
    let quoteSourceId: string | null = null;
    if (input.quoteSourceId) {
      await requireRepostActor(tx, context);
      repostDestination(context, input);
      quoteSourceId = (
        await originalForRepost(tx, context, input.quoteSourceId)
      ).id;
      if (input.scheduleLocal || input.scheduleZone)
        throw new PortalError(400, "Quote posts cannot be scheduled.");
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
    const scheduled = !!(input.scheduleLocal || input.scheduleZone);
    if (scheduled && !authorChurchId)
      throw new PortalError(
        403,
        "Scheduled publishing is available to authorized church publishers."
      );
    const schedule = scheduled
      ? postSchedule(input.scheduleLocal, input.scheduleZone, now)
      : {};
    await requireSocialActivity(tx, actorId, "post");
    const post = await tx.platformPost.create({
      data: {
        ...details(input),
        ...(input.discovery !== undefined
          ? {
              ...(await postDiscoveryData(input.discovery)),
              discoveryVersion: 1
            }
          : {}),
        ...preparedLink,
        authorId: actorId,
        topicCommunityId,
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
        repostKind: quoteSourceId ? "QUOTE" : null,
        repostSourceId: quoteSourceId,
        eventOccurrenceId,
        scheduledById: scheduled ? actorId : null,
        status: scheduled ? "SCHEDULED" : "PUBLISHED",
        publishedAt: scheduled ? null : now,
        ...schedule
      }
    });
    await attachPostPhotosIn(tx, context, post, input.photos);
    await setPostMentions(tx, context, post, input.mentionIds);
    if (input.discovery !== undefined)
      await recordDiscoveryControl(
        tx,
        "POST_DISCOVERY",
        actorId,
        post.id,
        post.discoveryVersion
      );
    await audit(tx, post, actorId, scheduled ? "scheduled" : "published");
    await recordPostPublication(tx, post);
    return {
      id: post.id,
      version: post.version,
      message: scheduled
        ? "Your church post is scheduled. Manage its publication time in Scheduled posts."
        : "Your post is published."
    };
  }
  const post = await tx.platformPost.findUnique({
    where: { id: postId(input.postId) }
  });
  if (!post) throw new PortalError(404, "Post unavailable.");
  if (
    input.topicCommunityId !== undefined &&
    input.topicCommunityId !== post.topicCommunityId
  )
    throw new PortalError(400, "A published post keeps its topic destination.");
  if (
    post.topicCommunityId &&
    ((input.audience !== undefined && input.audience !== "PUBLIC") ||
      (input.replyAudience !== undefined && input.replyAudience !== "VIEWERS"))
  )
    throw new PortalError(
      400,
      "Topic posts remain public with topic member replies."
    );
  if (
    op === "withdraw"
      ? !postCanWithdraw(context, post)
      : !postCanEdit(context, post) &&
        !(op === "discussion" && postCanModerate(context, post))
  )
    throw new PortalError(
      403,
      "You cannot change this post. Refresh to check your current access."
    );
  expected(input.expectedVersion, post.version);
  if (post.status === "WITHDRAWN")
    throw new PortalError(409, "This post has been withdrawn.");
  if (post.repostKind === "PLAIN" && op !== "withdraw")
    throw new PortalError(
      400,
      "Use the original post for editing and discussion settings."
    );

  if (op === "edit") {
    if (
      input.quoteSourceId !== undefined &&
      input.quoteSourceId !== post.repostSourceId
    )
      throw new PortalError(
        400,
        "A published quote keeps its original source. Start a new post to quote another source."
      );
    if (input.photos !== undefined)
      throw new PortalError(
        400,
        "Use the published photo gallery to change its images."
      );
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
    if (nextAudience !== post.audience) {
      const references = await tx.postPhotoReference.findMany({
        where: { postId: post.id },
        include: { asset: { select: { version: true } } },
        take: 11
      });
      if (references.length > 10)
        throw new PortalError(409, "This gallery needs a size review.");
      await validatePostPhotosIn(
        tx,
        context,
        { ...post, audience: nextAudience },
        references.map((row) => ({
          id: row.assetId,
          version: row.asset.version
        }))
      );
    }
    const updated = await tx.platformPost.update({
      where: { id: post.id },
      data: {
        ...details({ ...post, ...input }),
        ...(input.discovery !== undefined
          ? {
              ...(await postDiscoveryData(input.discovery)),
              discoveryVersion: { increment: 1 }
            }
          : {}),
        ...preparedLink,
        audience: nextAudience,
        allowReposts: boolean(input.allowReposts ?? post.allowReposts),
        editedAt: post.status === "PUBLISHED" ? now : post.editedAt,
        version: { increment: 1 }
      }
    });
    if (input.mentionIds !== undefined) {
      await setPostMentions(tx, context, updated, input.mentionIds);
      await recordPostMentions(tx, updated);
    }
    await audit(tx, updated, actorId, "edited");
    if (input.discovery !== undefined)
      await recordDiscoveryControl(
        tx,
        "POST_DISCOVERY",
        actorId,
        updated.id,
        updated.discoveryVersion
      );
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
    const reported = await selectedSourceReport(tx, "POST", post.id);
    const updated = await tx.platformPost.update({
      where: { id: post.id },
      data: {
        status: "WITHDRAWN",
        withdrawnAt: now,
        discussionClosed: true,
        ...(!reported
          ? { content: "", contentNote: null, safeExcerpt: null }
          : {}),
        scripture: null,
        ...emptyPostLink,
        ...emptyPostDiscovery,
        discoveryVersion: { increment: 1 },
        topics: [],
        pinUntil: null,
        scheduleAt: null,
        scheduleLocal: null,
        scheduleZone: null,
        version: { increment: 1 }
      }
    });
    await audit(tx, updated, actorId, "withdrawn");
    if (
      post.discoveryLanguage ||
      post.discoveryDenomination ||
      post.discoveryCountry
    )
      await recordDiscoveryControl(
        tx,
        "POST_DISCOVERY",
        actorId,
        updated.id,
        updated.discoveryVersion
      );
    if (reported)
      await recordReportedWithdrawal(
        tx,
        reported,
        actorId,
        updated.version,
        now
      );
    return {
      id: updated.id,
      version: updated.version,
      message: "The post and discussion are no longer available to readers."
    };
  }
  if (op === "discussion") {
    const asModerator = !postCanEdit(context, post);
    if (
      asModerator &&
      (typeof input.moderationReason !== "string" ||
        !Object.hasOwn(discussionModerationReasons, input.moderationReason))
    )
      throw new PortalError(
        400,
        "Choose a reason for these moderation changes."
      );
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
    if (asModerator && post.topicCommunityId)
      await topicAudit(
        tx,
        post.topicCommunityId,
        actorId,
        "DISCUSSION_MODERATED",
        updated.version,
        {
          targetId: post.id,
          reason: input.moderationReason as string,
          fromState: discussionSettingsState(post),
          toState: discussionSettingsState(updated)
        }
      );
    else if (asModerator)
      await tx.churchAuditEvent.create({
        data: {
          churchId: post.authorChurchId ?? post.audienceChurchId,
          actorId,
          targetId: post.id,
          action: "DISCUSSION_MODERATED",
          reason: input.moderationReason as string,
          fromState: discussionSettingsState(post),
          toState: discussionSettingsState(updated),
          version: updated.version
        }
      });
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
export async function postCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  if (input.authorId !== undefined)
    throw new PortalError(
      400,
      "The acting account comes from your current sign-in."
    );
  if (input.mutationId !== undefined)
    return receiptedPostAction(db, token, input);
  if (input.operation === "create")
    return receiptedPostCreation(db, token, input);
  let preparedLink: PostLink | undefined;
  if (input.operation === "edit" && input.linkUrl !== undefined) {
    const source = await withOwnedSession(
      db,
      token,
      async (tx, session) => {
        const context = await postContext(tx, session.userId);
        const post = await tx.platformPost.findUnique({
          where: { id: postId(input.postId) }
        });
        if (!post || !postCanEdit(context, post))
          throw new PortalError(403, "You cannot change this post.");
        expected(input.expectedVersion, post.version);
        if (post.status === "WITHDRAWN")
          throw new PortalError(409, "This post has been withdrawn.");
        return { actorId: session.userId, existing: post };
      },
      true
    );
    preparedLink = await preparePostLink(
      source.actorId,
      input,
      source.existing
    );
  }
  const result = await withOwnedSession(
    db,
    token,
    async (tx, session) =>
      postCommandIn(
        tx,
        await postContext(tx, session.userId),
        input,
        preparedLink
      ),
    true
  );
  return preparedLink?.linkUrl &&
    input.keepLinkPreview === true &&
    !preparedLink.linkSourceUrl
    ? {
        ...result,
        message:
          result.message +
          " The link was saved without a preview; you can edit the post to try again."
      }
    : result;
}

// Existing direct publishing uses requestKey; retain that contract while storing
// its immutable input fingerprint in the existing receipt owner. Hashing bounds
// even a legacy long request key. Historical posts without fingerprints keep
// their original canonical retry behavior; new requests detect changed bodies.
async function receiptedPostCreation(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  const requestKey = postId(input.requestKey);
  const mutationId = createHash("sha256").update(requestKey).digest("hex");
  const current = async (tx: PostTx, ownerId: string) => {
    const prior = await tx.platformPost.findUnique({
      where: { authorId_requestKey: { authorId: ownerId, requestKey } }
    });
    if (prior && !postCanEdit(await postContext(tx, ownerId), prior))
      throw new PortalError(403, "This saved request is no longer editable.");
    return { prior, ownerId };
  };
  let preparedLink: PostLink | undefined;
  if (input.linkUrl !== undefined) {
    const source = await withOwnedSession(
      db,
      token,
      (tx, session) => current(tx, session.userId),
      true
    );
    preparedLink = source.prior
      ? emptyPostLink
      : await preparePostLink(source.ownerId, input);
  }
  const result = await socialCommand(
    db,
    token,
    "post-create",
    { ...input, mutationId },
    async (tx, ownerId) =>
      postCommandIn(tx, await postContext(tx, ownerId), input, preparedLink),
    async (tx, ownerId) => {
      await current(tx, ownerId);
    }
  );
  return preparedLink?.linkUrl &&
    input.keepLinkPreview === true &&
    !preparedLink.linkSourceUrl
    ? {
        ...result,
        message:
          result.message +
          " The link was saved without a preview; you can edit the post to try again."
      }
    : result;
}

// Published controls use the existing receipt owner. Current authority precedes
// replay; link validation stays outside the permission transaction. Older
// callers keep their versioned contract, and private drafts keep theirs.
async function receiptedPostAction(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  if (
    ![
      "edit",
      "discussion",
      "pin",
      "withdraw",
      "schedule",
      "cancel-schedule"
    ].includes(String(input.operation))
  )
    throw new PortalError(400, "Choose a supported post management action.");
  const key = `post-control:${socialKey(input.mutationId)}`;
  const authority = async (tx: PostTx, ownerId: string) => {
    const context = await postContext(tx, ownerId);
    const post = await tx.platformPost.findUnique({
      where: { id: postId(input.postId) }
    });
    if (!post) throw new PortalError(404, "Post unavailable.");
    // A removal receipt may be confirmed after withdrawal, but never after
    // losing the authority that allowed this action. No retained body is returned.
    const allowed =
      input.operation === "withdraw"
        ? postCanWithdraw(context, { ...post, status: "PUBLISHED" })
        : postCanEdit(context, post) ||
          (input.operation === "discussion" && postCanModerate(context, post));
    if (!allowed)
      throw new PortalError(
        403,
        "You cannot change this post. Refresh to check your current access."
      );
    return { context, post };
  };
  const source = await withOwnedSession(
    db,
    token,
    async (tx, session) => {
      const current = await authority(tx, session.userId);
      const prior = await tx.socialOperation.findUnique({
        where: { ownerId_key: { ownerId: session.userId, key } },
        select: { key: true }
      });
      if (!prior) expected(input.expectedVersion, current.post.version);
      return { ...current, prior: !!prior, ownerId: session.userId };
    },
    true
  );
  const link =
    !source.prior && input.operation === "edit" && input.linkUrl !== undefined
      ? await preparePostLink(source.ownerId, input, source.post)
      : undefined;
  return socialCommand(
    db,
    token,
    "post-control",
    input,
    async (tx, ownerId) => {
      const result = await postCommandIn(
        tx,
        await postContext(tx, ownerId),
        input,
        link
      );
      return link?.linkUrl &&
        input.keepLinkPreview === true &&
        !link.linkSourceUrl
        ? {
            ...result,
            message:
              result.message +
              " The link was saved without a preview; you can edit the post to try again."
          }
        : result;
    },
    async (tx, ownerId) => {
      await authority(tx, ownerId);
    }
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
        !post.scheduleAt
      )
        return { published: false, changed: false, retryAfterSeconds: 0 };
      if (post.scheduleAt > now)
        return {
          published: false,
          changed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((post.scheduleAt.getTime() - now.getTime()) / 1000)
          )
        };
      const context = await postContext(tx, post.scheduledById);
      let allowed =
        !!post.authorChurchId &&
        context.publishers.has(post.authorChurchId) &&
        post.moderationState === "VISIBLE" &&
        !post.topicCommunityId &&
        !post.repostKind &&
        (!post.audienceChurchId ||
          context.churches.includes(post.audienceChurchId)) &&
        now.getTime() - post.scheduleAt.getTime() <= 86_400_000;
      if (allowed) {
        try {
          await eventLink(
            tx,
            context,
            post.eventOccurrenceId,
            post.audienceChurchId
          );
          const photos = await tx.postPhotoReference.findMany({
            where: { postId: post.id },
            select: { assetId: true, asset: { select: { version: true } } },
            take: 11
          });
          if (photos.length > 10)
            throw new PortalError(409, "Review the scheduled gallery.");
          if (photos.length)
            await validatePostPhotosIn(
              tx,
              await postContext(tx, post.authorId),
              post,
              photos.map((photo) => ({
                id: photo.assetId,
                version: photo.asset.version
              }))
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
          scheduleDispatchedAt: null,
          scheduleDispatchedVersion: null,
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
      if (allowed) await recordPostPublication(tx, updated);
      return { published: allowed, changed: true, retryAfterSeconds: 0 };
    },
    { maxWait: 10000, timeout: 15000 }
  );
}
