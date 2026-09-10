import type { Prisma, PrismaClient } from "@prisma/client";
import { activePublicAccount, communityAuthorSelect } from "./public-profile";
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
      where: { userId: context.actorId ?? "", user: activePublicAccount },
      select: { id: true }
    },
    _count: {
      select: {
        likes: { where: { user: activePublicAccount } },
        comments: { where: { author: activePublicAccount } }
      }
    },
    comments: {
      where: {
        author: activePublicAccount,
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
    canEdit: postCanEdit(context, post),
    canWithdraw: postCanEdit(context, post) || postCanModerate(context, post),
    canReply: postCanReply(context, post),
    comments: post.comments.map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      content: c.content,
      author: c.author,
      canDelete: context.actorId === c.authorId
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
  if (query.feed && context.actorId) {
    const following = await tx.platformFollow.findMany({
      where: { followerId: context.actorId, following: activePublicAccount },
      select: { followingId: true }
    });
    filters.push({
      OR: [
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
  if (query.before && query.cursor)
    filters.push({
      OR: [
        { publishedAt: { lt: query.before } },
        { publishedAt: query.before, id: { lt: query.cursor } }
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
