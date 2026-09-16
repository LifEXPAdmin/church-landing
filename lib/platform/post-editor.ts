import { photoLibraryEnabled } from "./personal-photo-policy";
import { postDiscoveryInput } from "./post-discovery";
import { postPreviewText } from "./post-options";
import type { PrismaClient } from "@prisma/client";
import { PortalError } from "./portal-policy";
import {
  postCanEdit,
  postCanModerate,
  postCanWithdraw,
  postReadableWhere,
  withPostRead
} from "./post-access";
import { postId } from "./post-input";
import { socialUserWhere } from "./social-policy";
import {
  discussionModerationReasons,
  discussionSettingsLabel,
  type DiscussionModerationReason
} from "./post-discussion-options";

export function getPostComposer(db: PrismaClient, token: unknown) {
  return withPostRead(db, token, async (tx, context) => {
    if (!context.actorId)
      throw new PortalError(401, "Sign in to publish a post.");
    const churches = await tx.church.findMany({
      where: { id: { in: context.churches } },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }]
    });
    return {
      topics: await tx.topicCommunity.findMany({
        where: { id: { in: [...(context.topicParticipants ?? [])] } },
        select: { id: true, name: true, slug: true },
        orderBy: [{ nameKey: "asc" }, { id: "asc" }],
        take: 200
      }),
      photoLibraryEnabled: photoLibraryEnabled(),
      churches: churches.map((c) => ({
        ...c,
        canPublish: context.publishers.has(c.id)
      }))
    };
  });
}
export type PostComposerOptions = Awaited<ReturnType<typeof getPostComposer>>;

export function getPostEventOptions(
  db: PrismaClient,
  token: unknown,
  church: unknown,
  cursor?: string | null
) {
  return withPostRead(db, token, async (tx, context) => {
    const churchId = postId(church);
    if (!context.actorId) throw new PortalError(401, "Sign in to continue.");
    if (!context.churches.includes(churchId))
      throw new PortalError(403, "An approved church connection is required.");
    // Only published source events are offered. Never copy private calendar details.
    const rows = await tx.calendarOccurrence.findMany({
      where: {
        canceledAt: null,
        endAt: { gt: new Date() },
        ...(cursor ? { id: { gt: postId(cursor) } } : {}),
        event: {
          canceledAt: null,
          visibility: { in: ["PUBLIC", "CHURCH"] },
          calendar: { churchId, archivedAt: null }
        }
      },
      select: {
        id: true,
        title: true,
        startLocal: true,
        timeZone: true,
        event: { select: { visibility: true } },
        discussionPost: { select: { id: true } }
      },
      orderBy: { id: "asc" },
      take: 31
    });
    const events = rows.slice(0, 30).map((r) => ({
      id: r.id,
      title: r.title,
      startLocal: r.startLocal,
      timeZone: r.timeZone,
      visibility: r.event.visibility,
      hasDiscussion: !!r.discussionPost
    }));
    return { events, nextCursor: rows.length > 30 ? events.at(-1)!.id : null };
  });
}
export type PostEventOptions = Awaited<ReturnType<typeof getPostEventOptions>>;

export function getPostEditor(db: PrismaClient, token: unknown, id: string) {
  return withPostRead(db, token, async (tx, context) => {
    if (!context.actorId) throw new PortalError(401, "Sign in to continue.");
    const post = await tx.platformPost.findFirst({
      where: {
        AND: [
          { id: postId(id) },
          {
            OR: [
              postReadableWhere(context),
              {
                status: { in: ["DRAFT", "SCHEDULED"] },
                authorChurchId: { in: [...context.publishers] },
                moderationState: "VISIBLE",
                topicCommunityId: null,
                repostKind: null
              }
            ]
          }
        ]
      },
      include: {
        authorChurch: { select: { name: true } },
        audienceChurch: { select: { name: true } },
        eventOccurrence: { select: { event: { select: { visibility: true } } } }
      }
    });
    if (!post) throw new PortalError(404, "Post unavailable.");
    const canEdit = postCanEdit(context, post),
      canModerate = postCanModerate(context, post),
      canWithdraw = postCanWithdraw(context, post);
    if (!canEdit && !canModerate && !canWithdraw)
      throw new PortalError(403, "You cannot manage this post.");
    const moderationChurchId =
      post.authorChurchId ??
      (post.audience === "CHURCH" ? post.audienceChurchId : null);
    const moderation =
      post.topicCommunityId && (canEdit || canModerate)
        ? await tx.topicAudit.findMany({
            where: {
              communityId: post.topicCommunityId,
              targetId: post.id,
              action: "DISCUSSION_MODERATED"
            },
            select: {
              id: true,
              actorId: true,
              reason: true,
              fromState: true,
              toState: true,
              version: true,
              createdAt: true
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 10
          })
        : moderationChurchId && (canEdit || canModerate)
          ? await tx.churchAuditEvent.findMany({
              where: {
                churchId: moderationChurchId,
                targetId: post.id,
                action: "DISCUSSION_MODERATED"
              },
              select: {
                id: true,
                actorId: true,
                reason: true,
                fromState: true,
                toState: true,
                version: true,
                createdAt: true
              },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 10
            })
          : [];
    const names = new Map(
      moderation.length
        ? (
            await tx.platformUser.findMany({
              where: {
                AND: [
                  { id: { in: moderation.map((row) => row.actorId) } },
                  socialUserWhere(context)
                ]
              },
              select: { id: true, name: true }
            })
          ).map((actor) => [actor.id, actor.name])
        : []
    );
    return {
      id: post.id,
      status: post.status,
      scheduleAt: post.scheduleAt?.toISOString() ?? null,
      scheduleLocal: post.scheduleLocal ?? "",
      scheduleZone: post.scheduleZone ?? "",
      discovery: postDiscoveryInput(post),
      topicCommunityId: post.topicCommunityId,
      version: post.version,
      mentionIds: canEdit
        ? (
            await tx.postMention.findMany({
              where: { postId: post.id, active: true },
              select: { recipientId: true },
              take: 5
            })
          ).map((m) => m.recipientId)
        : [],
      content: post.content,
      contentNote: post.contentNote ?? "",
      safeExcerpt: post.safeExcerpt ?? "",
      scripture: post.scripture ?? "",
      linkUrl: post.linkUrl,
      linkTitle: post.linkTitle,
      linkDescription: post.linkDescription,
      linkSourceUrl: post.linkSourceUrl,
      type: post.type,
      topics: post.topics,
      audience: post.audience,
      churchId: post.audienceChurchId,
      churchName: post.audienceChurch?.name ?? null,
      authorName: post.authorChurch?.name ?? "Me",
      churchAuthor: !!post.authorChurchId,
      eventAudience: post.eventOccurrence?.event.visibility ?? null,
      discussionClosed: post.discussionClosed,
      replyAudience: post.replyAudience,
      allowReposts: post.allowReposts,
      repostKind: post.repostKind,
      pinUntil: post.pinUntil?.toISOString() ?? null,
      canEdit,
      canDiscuss: post.repostKind !== "PLAIN" && (canEdit || canModerate),
      discussionModeration: moderation.map((row) => ({
        id: row.id,
        actor: names.get(row.actorId) ?? "Unavailable member",
        reason: Object.hasOwn(discussionModerationReasons, row.reason ?? "")
          ? discussionModerationReasons[
              row.reason as DiscussionModerationReason
            ]
          : "Earlier moderation decision",
        before: discussionSettingsLabel(row.fromState),
        after: discussionSettingsLabel(row.toState),
        version: row.version,
        createdAt: row.createdAt.toISOString()
      })),
      canWithdraw,
      canPin: canEdit && !!post.authorChurchId && post.status === "PUBLISHED"
    };
  });
}
export type PostEditorView = Awaited<ReturnType<typeof getPostEditor>>;

export function getScheduledPosts(
  db: PrismaClient,
  token: unknown,
  after?: string | null
) {
  return withPostRead(db, token, async (tx, context) => {
    if (!context.actorId)
      throw new PortalError(401, "Sign in to view scheduled posts.");
    const rows = await tx.platformPost.findMany({
      where: {
        authorChurchId: { in: [...context.publishers] },
        status: { in: ["DRAFT", "SCHEDULED"] },
        moderationState: "VISIBLE",
        topicCommunityId: null,
        repostKind: null,
        ...(after ? { id: { gt: postId(after) } } : {})
      },
      select: {
        id: true,
        version: true,
        content: true,
        contentNote: true,
        safeExcerpt: true,
        status: true,
        scheduleLocal: true,
        scheduleZone: true,
        authorChurch: { select: { name: true } }
      },
      orderBy: { id: "asc" },
      take: 21
    });
    return {
      items: rows.slice(0, 20).map((row) => ({
        id: row.id,
        version: row.version,
        excerpt: postPreviewText(row).slice(0, 160),
        status: row.status,
        scheduleLocal: row.scheduleLocal,
        scheduleZone: row.scheduleZone,
        church: row.authorChurch!.name
      })),
      nextCursor: rows.length > 20 ? rows[19].id : null
    };
  });
}
