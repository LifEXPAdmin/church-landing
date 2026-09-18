import type { PrismaClient } from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import {
  commentVisibleWhere,
  readableComment,
  readableConversation
} from "./comment-policy";
import { groupCategories, groupChoice } from "./group-input";
import { requireGroupParticipation, unavailableGroup } from "./group-policy";
import {
  afterGroupPosition,
  groupReadScope,
  saveGroupReadProgress
} from "./group-read-progress";
import { postContext, withPostRead } from "./post-access";
import { listPostsIn } from "./post-reads";
import { postField, postId } from "./post-input";
import { expected, PortalError } from "./portal-policy";
import { socialCommand, socialInput } from "./social-operations";
import { requirePrivilegedAuthentication } from "./privileged-auth-policy";

export function groupDiscussionCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  const op = input.operation;
  if (!["pin-thread", "select-answer", "read-progress"].includes(String(op)))
    throw new PortalError(400, "Choose a supported discussion action.");
  socialInput(input, [
    "operation",
    "mutationId",
    "postId",
    "expectedVersion",
    ...(op === "pin-thread"
      ? ["desired", "reason"]
      : op === "select-answer"
        ? ["commentId"]
        : ["proof", "shownIds"])
  ]);
  const authorize = async (
    tx: Parameters<typeof readableConversation>[0],
    actorId: string
  ) => {
    const context = await postContext(tx, actorId),
      post = await readableConversation(tx, context, input.postId);
    if (!post.groupId || !context.groupReaders?.has(post.groupId))
      throw unavailableGroup();
    if (op !== "read-progress")
      requireGroupParticipation(context, post.groupId);
    if (
      op === "pin-thread" ||
      (op === "select-answer" && post.authorId !== actorId)
    ) {
      await requirePrivilegedAuthentication(tx, actorId);
      if (!context.groupModerators?.has(post.groupId)) throw unavailableGroup();
    }
    return { context, post };
  };
  if (op === "read-progress")
    return withOwnedSession(
      db,
      token,
      async (tx, session) => {
        const { context, post } = await authorize(tx, session.userId);
        const version = await saveGroupReadProgress(
          tx,
          context,
          post,
          input.proof,
          input.shownIds
        );
        return {
          id: post.id,
          version,
          message: "Your private read progress was saved."
        };
      },
      true
    );
  return socialCommand(
    db,
    token,
    "group-discussion",
    input,
    async (tx, actorId) => {
      const { context, post } = await authorize(tx, actorId);
      expected(input.expectedVersion, post.version);
      let data;
      let reason: string | undefined;
      if (op === "pin-thread") {
        if (typeof input.desired !== "boolean")
          throw new PortalError(400, "Choose whether to pin this thread.");
        reason = postField(input.reason, 300, 3);
        if (
          input.desired &&
          (await tx.platformPost.count({
            where: {
              groupId: post.groupId,
              id: { not: post.id },
              status: "PUBLISHED",
              moderationState: "VISIBLE",
              groupPinnedAt: { not: null }
            }
          })) >= 5
        )
          throw new PortalError(
            409,
            "A group can have up to five pinned threads."
          );
        data = { groupPinnedAt: input.desired ? new Date() : null };
      } else {
        if (post.groupThreadKind !== "QUESTION")
          throw new PortalError(
            400,
            "Only a question can have a selected answer."
          );
        const comment =
          input.commentId === null
            ? null
            : await readableComment(tx, context, post.id, input.commentId);
        data = { selectedAnswerId: comment?.id ?? null };
      }
      const saved = await tx.platformPost.update({
        where: { id: post.id },
        data: { ...data, version: { increment: 1 } }
      });
      await tx.postAudit.create({
        data: {
          postId: post.id,
          actorId,
          action: String(op),
          targetId: data.selectedAnswerId ?? undefined,
          version: saved.version
        }
      });
      await tx.gatherGroupAudit.create({
        data: {
          groupId: post.groupId!,
          actorId,
          targetId: post.id,
          action: String(op),
          reason,
          version: saved.version
        }
      });
      return {
        id: post.id,
        version: saved.version,
        message:
          op === "pin-thread"
            ? "Thread pin updated."
            : "The question's selected answer was updated."
      };
    },
    async (tx, actorId) => {
      await authorize(tx, actorId);
    }
  );
}
export function readGroupDiscussions(
  db: PrismaClient,
  token: unknown,
  input: {
    groupId: unknown;
    category?: unknown;
    before?: string;
    cursor?: string;
  }
) {
  return withPostRead(db, token, async (tx, context) => {
    const groupId = postId(input.groupId);
    if (!context.groupReaders?.has(groupId)) throw unavailableGroup();
    const category = input.category
      ? groupChoice(input.category, groupCategories)
      : undefined;
    const before = input.before ? new Date(input.before) : undefined;
    if (before && !Number.isFinite(before.getTime()))
      throw new PortalError(
        400,
        "Reload the discussion list before loading more."
      );
    const posts = await listPostsIn(tx, context, {
      groupId,
      groupCategory: category,
      limit: 21,
      before,
      cursor: input.cursor
    });
    const page = posts.slice(0, 20),
      preferences = await tx.conversationPreference.findMany({
        where: {
          ownerId: context.actorId!,
          postId: { in: page.map((p) => p.id) }
        }
      });
    const threads = [];
    for (const post of page) {
      const preference = preferences.find((p) => p.postId === post.id),
        current =
          preference?.readScope ===
          groupReadScope(context, {
            version: post.version,
            groupId: post.group?.id ?? null
          });
      const position =
        current && preference?.readCommentAt && preference.readCommentId
          ? {
              id: preference.readCommentId,
              createdAt: preference.readCommentAt
            }
          : null;
      const unreadReplies = await tx.platformPostComment.count({
        where: {
          AND: [
            {
              postId: post.id,
              id: { notIn: current ? (preference?.readCommentIds ?? []) : [] }
            },
            commentVisibleWhere(context),
            afterGroupPosition(position)
          ]
        }
      });
      threads.push({
        post,
        unread:
          !current ||
          (preference?.readPostVersion ?? 0) < post.version ||
          unreadReplies > 0,
        unreadReplies,
        following: preference?.mode === "FOLLOW"
      });
    }
    const pins = await listPostsIn(tx, context, {
      groupId,
      groupPinned: true,
      limit: 5
    });
    return {
      threads,
      pins,
      next:
        posts.length > 20
          ? { before: page[19].createdAt.toISOString(), cursor: page[19].id }
          : null,
      viewerId: context.actorId
    };
  });
}
export function readGroupSelectedAnswer(
  db: PrismaClient,
  token: unknown,
  id: unknown
) {
  return withPostRead(db, token, async (tx, context) => {
    const post = await readableConversation(tx, context, id);
    if (!post.groupId) throw unavailableGroup();
    const answer = post.selectedAnswerId
      ? await tx.platformPostComment.findFirst({
          where: {
            AND: [
              { id: post.selectedAnswerId, postId: post.id },
              commentVisibleWhere(context)
            ]
          },
          select: {
            id: true,
            content: true,
            author: { select: { id: true, name: true, username: true } },
            version: true
          }
        })
      : null;
    return {
      postId: post.id,
      version: post.version,
      question: post.groupThreadKind === "QUESTION",
      canSelect:
        !!context.groupParticipants?.has(post.groupId) &&
        (post.authorId === context.actorId ||
          !!context.groupModerators?.has(post.groupId)),
      answer,
      viewerId: context.actorId
    };
  });
}
