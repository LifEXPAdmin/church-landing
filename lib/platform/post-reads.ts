import { socialUserWhere, socialDiscoveryWhere } from "./social-policy";
import type { Prisma, PrismaClient } from "@prisma/client";
import { activePublicAccount, communityAuthorSelect } from "./public-profile";
import { homeFeedMode } from "./home-feed";
import { canOrganize } from "./post-participation";
import { commentVisibleWhere } from "./comment-policy";
import {
  postCanEdit,
  postCanModerate,
  postCanReply,
  postId,
  postInclude,
  postReadableWhere,
  withPostRead,
  type PostContext,
  type PostTx
} from "./post-access";

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
  count = 6,
  before?: Date,
  cursor?: string
) {
  return {
    ...postInclude,
    likes: {
      where: { userId: context.actorId ?? "", user: socialUserWhere(context) },
      select: { id: true }
    },
    _count: {
      select: {
        likes: { where: { user: socialUserWhere(context) } },
        images: {
          where: { purpose: "POST_PHOTO" as const, status: "READY" as const }
        },
        comments: { where: commentVisibleWhere(context) }
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
function project(post: PostRow, context: PostContext, now: Date) {
  return {
    id: post.id,
    createdAt: post.publishedAt ?? post.createdAt,
    updatedAt: post.updatedAt,
    type: post.type,
    content: post.content,
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
    liked: post.likes.length > 0,
    commentCount: post._count.comments,
    photoCount: post._count.images,
    canEdit: postCanEdit(context, post),
    canWithdraw: postCanEdit(context, post) || postCanModerate(context, post),
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
export type PostView = ReturnType<typeof project>;
export type PostQuery = {
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
  if (query.feed || query.search) filters.push(socialDiscoveryWhere(context));
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
  const rows = await tx.platformPost.findMany({
    where: { AND: filters },
    include: include(context),
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: limit
  });
  return rows.map((row) => project(row, context, now));
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
        31,
        query.before ?? undefined,
        query.cursor ?? undefined
      )
    });
    return row ? project(row, context, now) : null;
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
