import { photoLibraryEnabled } from "./personal-photo-policy";
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
      where: { AND: [{ id: postId(id) }, postReadableWhere(context)] },
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
    return {
      id: post.id,
      version: post.version,
      content: post.content,
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
      canWithdraw,
      canPin: canEdit && !!post.authorChurchId
    };
  });
}
export type PostEditorView = Awaited<ReturnType<typeof getPostEditor>>;
