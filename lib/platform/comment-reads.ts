import { createHmac, timingSafeEqual } from "node:crypto";
import type { Prisma, PrismaClient, PlatformPost } from "@prisma/client";
import { accountConfig } from "./account-config";
import { withOwnedSession } from "./account-sessions";
import { PortalError } from "./portal-policy";
import { communityAuthorSelect } from "./public-profile";
import {
  postCanReply,
  withPostRead,
  type PostContext,
  type PostTx
} from "./post-access";
import { postId } from "./post-input";
import { socialUserWhere } from "./social-policy";
import {
  commentVisibleWhere,
  readableConversation,
  readableComment,
  canPinComment,
  canDeleteComment
} from "./comment-policy";
import { eligibleMention } from "./comment-commands";
const PAGE = 20;
type Query = {
  postId: unknown;
  view?: string;
  rootId?: unknown;
  commentId?: unknown;
  sort?: string;
  after?: unknown;
  q?: unknown;
};
function cursorCodec(scope: string) {
  const sign = (body: string) =>
    createHmac("sha256", accountConfig().rateSecret)
      .update("comments:" + scope + ":" + body)
      .digest("hex");
  return {
    encode: (row: { id: string; createdAt: Date }) => {
      const body = Buffer.from(
        JSON.stringify({ id: row.id, at: row.createdAt.toISOString() })
      ).toString("base64url");
      return body + "." + sign(body);
    },
    decode: (value: unknown) => {
      if (!value) return null;
      try {
        if (typeof value !== "string" || value.length > 600) throw Error();
        const [body, signature, extra] = value.split(".");
        if (
          extra ||
          !/^[a-f0-9]{64}$/.test(signature) ||
          !timingSafeEqual(Buffer.from(sign(body)), Buffer.from(signature))
        )
          throw Error();
        const row = JSON.parse(Buffer.from(body, "base64url").toString());
        if (
          typeof row.at !== "string" ||
          new Date(row.at).toISOString() !== row.at
        )
          throw Error();
        return { id: postId(row.id), createdAt: new Date(row.at) };
      } catch {
        throw new PortalError(
          400,
          "Reload this conversation before loading more replies."
        );
      }
    }
  };
}
function include(context: PostContext) {
  return {
    author: {
      select: {
        ...communityAuthorSelect,
        suspendedAt: true,
        deactivatedAt: true
      }
    },
    authorChurch: { select: { id: true, name: true } },
    mentions: {
      where: { active: true, recipient: socialUserWhere(context) },
      select: { recipient: { select: communityAuthorSelect } },
      take: 5
    },
    likes: {
      where: { userId: context.actorId ?? "" },
      select: { active: true, version: true }
    },
    _count: {
      select: {
        likes: { where: { active: true, user: socialUserWhere(context) } },
        replies: { where: commentVisibleWhere(context) }
      }
    }
  };
}
type Row = Prisma.PlatformPostCommentGetPayload<{
  include: ReturnType<typeof include>;
}>;
const visible = (r: Row, c: PostContext) =>
  !r.deletedAt &&
  (!!r.authorChurch ||
    (!r.author.suspendedAt &&
      !r.author.deactivatedAt &&
      !c.blockedIds?.includes(r.authorId)));
async function project(
  tx: PostTx,
  rows: Row[],
  context: PostContext,
  post: PlatformPost
) {
  const parents = await tx.platformPostComment.findMany({
    where: {
      AND: [
        { id: { in: rows.flatMap((r) => (r.parentId ? [r.parentId] : [])) } },
        commentVisibleWhere(context)
      ]
    },
    select: {
      id: true,
      author: { select: communityAuthorSelect },
      authorChurch: { select: { id: true, name: true } }
    }
  });
  return rows.map((row) => {
    const available = visible(row, context),
      parent = parents.find((p) => p.id === row.parentId);
    const author = row.authorChurch
      ? {
          id: row.authorChurch.id,
          name: row.authorChurch.name,
          username: null,
          role: "CHURCH" as const,
          churchId: row.authorChurch.id
        }
      : {
          id: row.author.id,
          name: row.author.name,
          username: row.author.username,
          role: row.author.role,
          churchId: null
        };
    return {
      id: row.id,
      rootId: row.rootId,
      parentId: row.parentId,
      unavailable: !available,
      createdAt: row.createdAt,
      content: available ? row.content : null,
      author: available ? author : null,
      version: available ? row.version : null,
      editedAt: available ? row.editedAt : null,
      isPostAuthor:
        available &&
        (row.authorChurchId
          ? row.authorChurchId === post.authorChurchId
          : !post.authorChurchId && row.authorId === post.authorId),
      replyTo:
        available && row.parentId
          ? {
              id: row.parentId,
              name: parent
                ? (parent.authorChurch?.name ?? parent.author.name)
                : null
            }
          : null,
      mentions: available ? row.mentions.map((m) => m.recipient) : [],
      likeCount: available ? row._count.likes : 0,
      liked: available && (row.likes[0]?.active ?? false),
      likeVersion: available ? (row.likes[0]?.version ?? 0) : 0,
      replyCount: row._count.replies,
      canReply: available && postCanReply(context, post),
      canEdit:
        available &&
        canDeleteComment(context, row) &&
        postCanReply(context, post),
      canDelete: available && canDeleteComment(context, row),
      href: `/platform/posts/${post.id}?comment=${row.id}`
    };
  });
}
export function readComments(db: PrismaClient, token: unknown, query: Query) {
  return withPostRead(db, token, async (tx, context) => {
    const post = await readableConversation(tx, context, query.postId),
      view = query.view ?? "roots";
    if (
      !["roots", "replies", "context", "mentions"].includes(view) ||
      (query.sort && !["oldest", "newest"].includes(query.sort))
    )
      throw new PortalError(400, "Choose a supported conversation view.");
    if (view === "mentions") {
      if (!context.actorId)
        throw new PortalError(401, "Sign in to mention someone.");
      const q = typeof query.q === "string" ? query.q.trim() : "";
      if (q.length > 100) throw new PortalError(400, "Use a shorter name.");
      if (q.length < 2)
        return { kind: "mentions" as const, items: [], nextCursor: null };
      const contains = {
        contains: q.replace(/[\\%_]/g, "\\$&"),
        mode: "insensitive" as const
      };
      const codec = cursorCodec(`${context.actorId}:${post.id}:mentions:${q}`),
        after = codec.decode(query.after);
      // Scan a bounded candidate page and retain a cursor even if every candidate
      // is ineligible. Clients may continue; private candidates are never returned.
      const candidates = await tx.platformUser.findMany({
        where: {
          AND: [
            socialUserWhere(context),
            {
              id: { not: context.actorId, ...(after ? { gt: after.id } : {}) }
            },
            { OR: [{ name: contains }, { username: contains }] }
          ]
        },
        select: { ...communityAuthorSelect, createdAt: true },
        orderBy: { id: "asc" },
        take: PAGE + 1
      });
      const items = [];
      for (const candidate of candidates.slice(0, PAGE))
        if (await eligibleMention(tx, context, post.id, candidate.id)) {
          items.push({
            id: candidate.id,
            name: candidate.name,
            username: candidate.username,
            role: candidate.role
          });
        }
      return {
        kind: "mentions" as const,
        items,
        nextCursor:
          candidates.length > PAGE ? codec.encode(candidates[PAGE - 1]) : null
      };
    }
    const sort = view === "roots" && query.sort === "newest" ? "desc" : "asc";
    let rootId = view === "replies" ? postId(query.rootId) : null;
    let target: Awaited<ReturnType<typeof readableComment>> | null = null;
    if (view === "context") {
      target = await readableComment(tx, context, post.id, query.commentId);
      rootId = target.rootId ?? target.id;
    }
    let root: Row | null = null;
    if (rootId) {
      root = await tx.platformPostComment.findFirst({
        where: {
          id: rootId,
          postId: post.id,
          rootId: null,
          OR: [
            commentVisibleWhere(context),
            { replies: { some: commentVisibleWhere(context) } }
          ]
        },
        include: include(context)
      });
      if (!root) throw new PortalError(404, "This comment is unavailable.");
    }
    const codec = cursorCodec(
        `${context.actorId ?? "guest"}:${post.id}:${rootId ?? "roots"}:${sort}`
      ),
      after = codec.decode(query.after);
    const filters: Prisma.PlatformPostCommentWhereInput[] = [
      { postId: post.id, rootId },
      rootId
        ? commentVisibleWhere(context)
        : {
            OR: [
              commentVisibleWhere(context),
              { replies: { some: commentVisibleWhere(context) } }
            ]
          }
    ];
    if (after)
      filters.push({
        OR: [
          { createdAt: { [sort === "asc" ? "gt" : "lt"]: after.createdAt } },
          {
            createdAt: after.createdAt,
            id: { [sort === "asc" ? "gt" : "lt"]: after.id }
          }
        ]
      });
    const rows = await tx.platformPostComment.findMany({
      where: { AND: filters },
      include: include(context),
      orderBy: [{ createdAt: sort }, { id: sort }],
      take: PAGE + 1
    });
    const pin = await tx.commentPin.findUnique({ where: { postId: post.id } });
    const pinned = pin?.commentId
      ? await tx.platformPostComment.findFirst({
          where: { AND: [{ id: pin.commentId }, commentVisibleWhere(context)] },
          include: include(context)
        })
      : null;
    const preference = context.actorId
      ? await tx.conversationPreference.findUnique({
          where: {
            ownerId_postId: { ownerId: context.actorId, postId: post.id }
          },
          select: { mode: true, version: true }
        })
      : null;
    const targetRow = target
      ? await tx.platformPostComment.findUnique({
          where: { id: target.id },
          include: include(context)
        })
      : null;
    return {
      kind: "thread" as const,
      postId: post.id,
      sort: sort === "asc" ? "oldest" : "newest",
      items: await project(tx, rows.slice(0, PAGE), context, post),
      nextCursor: rows.length > PAGE ? codec.encode(rows[PAGE - 1]) : null,
      root: root ? (await project(tx, [root], context, post))[0] : null,
      // A deep link returns its exact visible target separately, even if it is
      // outside the first reply page. No enormous prefix scan is required.
      target: targetRow
        ? (await project(tx, [targetRow], context, post))[0]
        : null,
      pinned: pinned ? (await project(tx, [pinned], context, post))[0] : null,
      pinVersion: pin?.version ?? 0,
      canPin: canPinComment(context, post),
      canReply: postCanReply(context, post),
      discussionClosed: post.discussionClosed,
      visibleCount: await tx.platformPostComment.count({
        where: { AND: [{ postId: post.id }, commentVisibleWhere(context)] }
      }),
      conversation: preference ?? { mode: "DEFAULT", version: 0 }
    };
  });
}
export function readCommentDrafts(
  db: PrismaClient,
  token: unknown,
  query: {
    id?: unknown;
    postId?: unknown;
    replyToId?: unknown;
    after?: unknown;
  }
) {
  return withOwnedSession(
    db,
    token,
    async (tx, session) => {
      const rows = await tx.privateCommentDraft.findMany({
        where: {
          ownerId: session.userId,
          deletedAt: null,
          ...(query.id ? { id: postId(query.id) } : {}),
          ...(query.postId
            ? {
                postId: postId(query.postId),
                replyToId: query.replyToId ? postId(query.replyToId) : null
              }
            : {}),
          ...(query.after ? { id: { gt: postId(query.after) } } : {})
        },
        select: {
          id: true,
          postId: true,
          replyToId: true,
          authorChurchId: true,
          content: true,
          mentionIds: true,
          version: true,
          updatedAt: true
        },
        orderBy: { id: "asc" },
        take: PAGE + 1
      });
      return {
        items: rows.slice(0, PAGE),
        nextCursor: rows.length > PAGE ? rows[PAGE - 1].id : null
      };
    },
    true
  );
}
