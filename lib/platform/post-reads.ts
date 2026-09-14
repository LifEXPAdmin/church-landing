import { feedMode } from "./feed-options";
import { feedReadableWhere } from "./feed-policy";
import { PortalError } from "./portal-policy";
import { repostSourceWhere } from "./repost-policy";
import { readableAssetWhere } from "./personal-photo-policy";
import { socialUserWhere, socialDiscoveryWhere } from "./social-policy";
import type { Prisma, PrismaClient } from "@prisma/client";
import { activePublicAccount, communityAuthorSelect } from "./public-profile";
import { homeFeedMode } from "./home-feed";
import { canOrganize } from "./post-participation";
import { commentVisibleWhere, commentPreviewIds } from "./comment-policy";
import {
  postCanEdit,
  postCanWithdraw,
  postCanReply,
  postInclude,
  postReadableWhere,
  withPostRead,
  type PostContext,
  type PostTx
} from "./post-access";
import { postId } from "./post-input";

const commentSelect = {
  id: true,
  createdAt: true,
  content: true,
  authorId: true,
  authorChurchId: true,
  authorChurch: { select: { id: true, name: true } },
  author: { select: communityAuthorSelect }
} as const;
function include(
  context: PostContext,
  postIds: string[],
  count = 6,
  before?: Date,
  cursor?: string
) {
  return {
    ...postInclude,
    likes: {
      where: { userId: context.actorId ?? "", user: socialUserWhere(context) },
      select: { active: true, version: true }
    },
    _count: {
      select: {
        likes: {
          where: {
            postId: { in: postIds },
            active: true,
            user: socialUserWhere(context)
          }
        },
        images: {
          where: {
            postId: { in: postIds },
            purpose: "POST_PHOTO" as const,
            status: "READY" as const
          }
        },
        photoReferences: {
          where: { postId: { in: postIds }, asset: readableAssetWhere(context) }
        },
        comments: {
          where: {
            AND: [commentVisibleWhere(context), { postId: { in: postIds } }]
          }
        }
      }
    },
    comments: {
      where: {
        AND: [commentVisibleWhere(context)],
        ...(before && cursor
          ? {
              OR: [
                { createdAt: { lt: before } },
                { createdAt: before, id: { lt: cursor } }
              ]
            }
          : {})
      },
      select: commentSelect,
      orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
      take: count
    }
  };
}
type PostRow = Prisma.PlatformPostGetPayload<{
  include: ReturnType<typeof include>;
}>;
async function pageInclude(tx: PostTx, context: PostContext, ids: string[]) {
  const selection = include(context, ids);
  if (ids.length > 1) {
    const previews = await commentPreviewIds(tx, context, ids, 6);
    selection.comments.where.AND.push({ id: { in: previews } });
  }
  return selection;
}
function project(post: PostRow, context: PostContext, now: Date) {
  return {
    id: post.id,
    createdAt: post.publishedAt ?? post.createdAt,
    updatedAt: post.updatedAt,
    type: post.type,
    content: post.content,
    contentNote: post.contentNote,
    safeExcerpt: post.safeExcerpt,
    scripture: post.scripture,
    linkUrl: post.linkUrl,
    linkTitle: post.linkTitle,
    linkDescription: post.linkDescription,
    linkSourceUrl: post.linkSourceUrl,
    topics: post.topics,
    version: post.version,
    editedAt: post.editedAt,
    audience:
      post.eventOccurrence?.event.visibility === "CHURCH"
        ? ("CHURCH" as const)
        : post.audience,
    audienceChurchId: post.audienceChurchId,
    author: post.authorChurch
      ? {
          id: post.authorChurch.id,
          name: post.authorChurch.name,
          churchId: post.authorChurch.id,
          username: null,
          role: "CHURCH" as const
        }
      : { ...post.author, churchId: null },
    eventOccurrenceId: post.eventOccurrenceId,
    discussionClosed: post.discussionClosed,
    replyAudience: post.replyAudience,
    allowReposts: post.allowReposts,
    pinned: !!post.pinUntil && post.pinUntil > now,
    likeCount: post._count.likes,
    liked: post.likes[0]?.active ?? false,
    likeVersion: post.likes[0]?.version ?? 0,
    commentCount: post._count.comments,
    photoCount: post._count.images + post._count.photoReferences,
    canEdit: postCanEdit(context, post),
    canWithdraw: postCanWithdraw(context, post),
    canReply: postCanReply(context, post),
    hasParticipation: !!post.poll || post.volunteerSlots.length > 0,
    canOrganize: canOrganize(context, post),
    comments: post.comments.map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      content: c.content,
      author: c.authorChurch
        ? {
            id: c.authorChurch.id,
            name: c.authorChurch.name,
            username: null,
            role: "CHURCH" as const
          }
        : c.author,
      canDelete: c.authorChurchId
        ? context.publishers.has(c.authorChurchId)
        : context.actorId === c.authorId
    }))
  };
}
export type OriginalPostView = ReturnType<typeof project>;
export type PostView = OriginalPostView & {
  repost: null | {
    kind: "PLAIN" | "QUOTE";
    source: OriginalPostView | null;
    canUndo: boolean;
  };
};
async function projectRows(
  tx: PostTx,
  rows: PostRow[],
  context: PostContext,
  now: Date
): Promise<PostView[]> {
  const ids = [
    ...new Set(
      rows.flatMap((row) => (row.repostSourceId ? [row.repostSourceId] : []))
    )
  ];
  const sources = ids.length
    ? await tx.platformPost.findMany({
        where: { AND: [{ id: { in: ids } }, repostSourceWhere(context, now)] },
        include: await pageInclude(tx, context, ids)
      })
    : [];
  // A personal source blocking the original acting account also revokes the
  // retained reference. Never expose the underlying church publisher identity.
  const pairs = rows.flatMap((row) => {
    const source = sources.find((source) => source.id === row.repostSourceId);
    return source && !source.authorChurchId && source.authorId !== row.authorId
      ? [
          { ownerId: source.authorId, targetUserId: row.authorId },
          { ownerId: row.authorId, targetUserId: source.authorId }
        ]
      : [];
  });
  const blocks = pairs.length
    ? await tx.socialRelationship.findMany({
        where: { blocked: true, OR: pairs },
        select: { ownerId: true, targetUserId: true }
      })
    : [];
  const sourceFor = (row: PostRow) =>
    sources.find(
      (source) =>
        source.id === row.repostSourceId &&
        (source.authorChurchId ||
          !blocks.some(
            (block) =>
              (block.ownerId === row.authorId &&
                block.targetUserId === source.authorId) ||
              (block.ownerId === source.authorId &&
                block.targetUserId === row.authorId)
          ))
    );
  return rows.map((row) => ({
    ...project(row, context, now),
    repost: row.repostKind
      ? {
          kind: row.repostKind,
          canUndo:
            row.repostKind === "PLAIN" &&
            (row.authorChurchId
              ? context.publishers.has(row.authorChurchId)
              : row.authorId === context.actorId),
          source: sourceFor(row) ? project(sourceFor(row)!, context, now) : null
        }
      : null
  }));
}
/** Hydrate only this already authorized, ordered page through the shared reader. */
export async function hydratePostPage(
  tx: PostTx,
  context: PostContext,
  ids: string[],
  now = new Date()
) {
  if (!ids.length) return [];
  const rows = await tx.platformPost.findMany({
    where: { AND: [{ id: { in: ids } }, postReadableWhere(context, now)] },
    include: await pageInclude(tx, context, ids)
  });
  const views = await projectRows(tx, rows, context, now);
  const byId = new Map(views.map((view) => [view.id, view]));
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}
export type PostQuery = {
  excludePostId?: string;
  feed?: boolean;
  authorId?: string;
  churchId?: string;
  search?: string;
  before?: Date | null;
  cursor?: string | null;
  through?: Date | null;
  anchor?: string | null;
  pinned?: boolean;
  limit?: number;
};
export async function listPostsIn(
  tx: PostTx,
  context: PostContext,
  query: PostQuery = {},
  now = new Date()
) {
  const filters: Prisma.PlatformPostWhereInput[] = [
    postReadableWhere(context, now)
  ];
  if (query.feed || query.search)
    filters.push(socialDiscoveryWhere(context), {
      OR: [
        { repostKind: null },
        { repostSourceId: null },
        { repostSource: { is: socialDiscoveryWhere(context) } }
      ]
    });
  // Community mode broadens selection only after the audience/status boundary.
  if (query.feed && context.actorId && homeFeedMode() === "following") {
    const following = await tx.platformFollow.findMany({
      where: { followerId: context.actorId, following: activePublicAccount },
      select: { followingId: true }
    });
    const followedChurches = await tx.socialRelationship.findMany({
      where: { ownerId: context.actorId, followingChurch: true },
      select: { churchId: true },
      take: 2000
    });
    filters.push({
      OR: [
        {
          authorChurchId: {
            in: followedChurches.flatMap((r) =>
              r.churchId ? [r.churchId] : []
            )
          }
        },
        {
          authorChurchId: null,
          authorId: {
            in: [context.actorId, ...following.map((f) => f.followingId)]
          }
        },
        { audienceChurchId: { in: context.churches } }
      ]
    });
  }
  // A person's profile never claims a church-authored post as their own.
  if (query.authorId)
    filters.push({ authorId: postId(query.authorId), authorChurchId: null });
  if (query.excludePostId)
    filters.push({ id: { not: postId(query.excludePostId) } });
  if (query.churchId)
    filters.push({ audienceChurchId: postId(query.churchId) });
  if (query.search)
    filters.push({
      OR: [
        { content: { contains: query.search, mode: "insensitive" } },
        { scripture: { contains: query.search, mode: "insensitive" } }
      ]
    });
  if (query.pinned)
    filters.push({ authorChurchId: { not: null }, pinUntil: { gt: now } });
  else if (query.pinned === false)
    filters.push({
      OR: [
        { authorChurchId: null },
        { pinUntil: null },
        { pinUntil: { lte: now } }
      ]
    });
  if (query.before && query.cursor)
    filters.push({
      OR: [
        { publishedAt: { lt: query.before } },
        { publishedAt: query.before, id: { lt: query.cursor } }
      ]
    });
  if (query.through && query.anchor)
    filters.push({
      OR: [
        { publishedAt: { lt: query.through } },
        { publishedAt: query.through, id: { lte: postId(query.anchor) } }
      ]
    });
  const limit = Math.max(1, Math.min(31, query.limit ?? 31));
  // Select the authorized page before relation counts. Prisma otherwise groups
  // every post's comments/likes before LIMIT, extending the permission read lock.
  // Both reads stay inside the existing transaction and revocation boundary.
  const page = await tx.platformPost.findMany({
    where: { AND: filters },
    select: { id: true },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: limit
  });
  if (!page.length) return [];
  const ids = page.map((row) => row.id);
  const rows = await tx.platformPost.findMany({
    where: { id: { in: ids } },
    include: await pageInclude(tx, context, ids),
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }]
  });
  return projectRows(tx, rows, context, now);
}
export function listPosts(
  db: PrismaClient,
  token: unknown,
  query: PostQuery = {}
) {
  return withPostRead(db, token, (tx, context) =>
    listPostsIn(tx, context, query)
  );
}
export function getChurchPostFeed(
  db: PrismaClient,
  token: unknown,
  churchId: string,
  query: Pick<PostQuery, "before" | "cursor"> = {}
) {
  return withPostRead(db, token, async (tx, context) => {
    const now = new Date();
    const pinned = await listPostsIn(
      tx,
      context,
      { churchId, pinned: true, limit: 3 },
      now
    );
    const posts = await listPostsIn(
      tx,
      context,
      { ...query, churchId, pinned: false },
      now
    );
    return {
      pinned,
      posts,
      viewerId: context.actorId,
      canShare: context.churches.includes(churchId)
    };
  });
}
/** Bounded retained-detail check: current source permission/version, no body or counts. */
export function getPostAvailability(
  db: PrismaClient,
  token: unknown,
  id: string
) {
  return withPostRead(db, token, async (tx, context) => {
    const post = await tx.platformPost.findFirst({
      where: { AND: [{ id: postId(id) }, postReadableWhere(context)] },
      select: { version: true }
    });
    return {
      available: !!post,
      entryVersion: post?.version ?? null,
      sourceVersion: null
    };
  });
}
export function getPostAvailabilityBatch(
  db: PrismaClient,
  token: unknown,
  values: string[],
  scope?: unknown
) {
  if (!values.length || values.length > 30)
    throw new PortalError(400, "Check up to 30 post references at once.");
  const mode = feedMode(scope);
  if (scope && !mode) throw new PortalError(400, "Choose a supported feed.");
  const ids = [...new Set(values.map(postId))];
  return withPostRead(db, token, async (tx, context) => {
    const rows = await tx.platformPost.findMany({
      where: {
        AND: [
          { id: { in: ids } },
          mode ? feedReadableWhere(context, mode) : postReadableWhere(context)
        ]
      },
      select: {
        id: true,
        version: true,
        _count: {
          select: {
            comments: { where: commentVisibleWhere(context) },
            likes: { where: { active: true, user: socialUserWhere(context) } }
          }
        }
      }
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return {
      posts: ids.map((id) => {
        const row = byId.get(id);
        return {
          id,
          available: !!row,
          entryVersion: row?.version ?? null,
          commentCount: row?._count.comments ?? null,
          likeCount: row?._count.likes ?? null
        };
      })
    };
  });
}
export function getPost(
  db: PrismaClient,
  token: unknown,
  id: string,
  query: { before?: Date | null; cursor?: string | null } = {}
) {
  return withPostRead(db, token, async (tx, context) => {
    const now = new Date();
    const row = await tx.platformPost.findFirst({
      where: { AND: [{ id: postId(id) }, postReadableWhere(context, now)] },
      include: include(
        context,
        [postId(id)],
        31,
        query.before ?? undefined,
        query.cursor ?? undefined
      )
    });
    return row ? (await projectRows(tx, [row], context, now))[0] : null;
  });
}
export function getProfilePosts(
  db: PrismaClient,
  token: unknown,
  authorId: string,
  query: { before?: Date | null; cursor?: string | null } = {}
) {
  return withPostRead(db, token, async (tx, context) => {
    const now = new Date();
    const posts = await listPostsIn(
      tx,
      context,
      { ...query, authorId, limit: 31 },
      now
    );
    const count = await tx.platformPost.count({
      where: {
        AND: [
          { authorId: postId(authorId), authorChurchId: null },
          postReadableWhere(context, now)
        ]
      }
    });
    return { posts, count };
  });
}

export async function getPostViewIn(
  tx: PostTx,
  context: PostContext,
  id: string
): Promise<PostView | null> {
  const now = new Date();
  const row = await tx.platformPost.findFirst({
    where: { AND: [{ id }, postReadableWhere(context, now)] },
    include: include(context, [postId(id)])
  });
  return row ? (await projectRows(tx, [row], context, now))[0] : null;
}

/** Plain distribution entries reuse the original interaction and Bookmark IDs. */
export async function postInteractionIdIn(
  tx: PostTx,
  context: PostContext,
  id: string
): Promise<string> {
  const view = await getPostViewIn(tx, context, id);
  if (!view) throw new PortalError(404, "Post unavailable.");
  if (view.repost?.kind === "PLAIN") {
    if (!view.repost.source) throw new PortalError(404, "Post unavailable.");
    return view.repost.source.id;
  }
  return view.id;
}
