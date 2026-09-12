import type { PrismaClient } from "@prisma/client";
import {
  postContext,
  postReadableWhere,
  type PostContext,
  type PostTx
} from "./post-access";
import { postField, postId } from "./post-input";
import { expected, PortalError } from "./portal-policy";
import { mentionAllowed } from "./social-policy";
import { socialCommand, socialInput, socialKey } from "./social-operations";
import {
  readableConversation,
  readableComment,
  requireReply,
  canPinComment,
  canDeleteComment,
  deleteCommentIn
} from "./comment-policy";

export function commentMentionIds(input: unknown) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 5)
    throw new PortalError(400, "Choose at most five people to mention.");
  const ids = input.map(postId);
  if (new Set(ids).size !== ids.length)
    throw new PortalError(400, "Choose each mention once.");
  return ids;
}
export async function eligibleMention(
  tx: PostTx,
  context: PostContext,
  postId: string,
  recipientId: string
) {
  if (
    !context.actorId ||
    !(await mentionAllowed(tx, context.actorId, recipientId))
  )
    return false;
  const recipient = await postContext(tx, recipientId);
  return (
    !!recipient.actorId &&
    !!(await tx.platformPost.findFirst({
      where: { AND: [{ id: postId }, postReadableWhere(recipient)] },
      select: { id: true }
    }))
  );
}
async function updateMentions(
  tx: PostTx,
  context: PostContext,
  postId: string,
  commentId: string,
  ids: string[]
) {
  for (const recipientId of ids)
    if (!(await eligibleMention(tx, context, postId, recipientId)))
      throw new PortalError(
        400,
        "One or more mentions are unavailable. Remove them and keep your text."
      );
  await tx.commentMention.updateMany({
    where: { commentId, recipientId: { notIn: ids } },
    data: { active: false }
  });
  for (const recipientId of ids) {
    await tx.commentMention.upsert({
      where: { commentId_recipientId: { commentId, recipientId } },
      create: { commentId, recipientId },
      update: { active: true }
    });
    await tx.socialEvent.upsert({
      where: { key: `mention:${commentId}:${recipientId}` },
      create: {
        key: `mention:${commentId}:${recipientId}`,
        kind: "COMMENT_MENTIONED",
        actorId: context.actorId!,
        postId,
        commentId,
        recipientId
      },
      update: {}
    });
  }
}
export async function createCommentIn(
  tx: PostTx,
  context: PostContext,
  input: Record<string, unknown>
) {
  const post = await readableConversation(tx, context, input.postId);
  requireReply(context, post);
  const parent = input.replyToId
    ? await readableComment(tx, context, post.id, input.replyToId)
    : null;
  const authorChurchId = input.authorChurchId
    ? postId(input.authorChurchId)
    : null;
  if (
    authorChurchId &&
    (!context.publishers.has(authorChurchId) ||
      (post.audience === "CHURCH" && post.audienceChurchId !== authorChurchId))
  )
    throw new PortalError(
      403,
      "Choose a church you currently have permission to speak for in this audience."
    );
  const row = await tx.platformPostComment.create({
    data: {
      postId: post.id,
      authorId: context.actorId!,
      authorChurchId,
      content: postField(input.content, 1500, 2),
      parentId: parent?.id,
      rootId: parent ? (parent.rootId ?? parent.id) : null
    }
  });
  await updateMentions(
    tx,
    context,
    post.id,
    row.id,
    commentMentionIds(input.mentionIds)
  );
  await tx.socialEvent.create({
    data: {
      key: `comment:${row.id}`,
      kind: "COMMENT_CREATED",
      actorId: context.actorId!,
      postId: post.id,
      commentId: row.id
    }
  });
  return row;
}
export async function commentCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "operation",
    "mutationId",
    "postId",
    "commentId",
    "replyToId",
    "content",
    "mentionIds",
    "expectedVersion",
    "desired",
    "mode",
    "draftId",
    "draftVersion",
    "authorChurchId"
  ]);
  return socialCommand(db, token, "comments", input, async (tx, ownerId) => {
    const context = await postContext(tx, ownerId),
      op = input.operation;
    // Private draft reads and discards never reveal current post text or target labels.
    if (op === "draft-save" || op === "draft-delete") {
      const id = socialKey(input.draftId),
        where = { ownerId_id: { ownerId, id } };
      const old = await tx.privateCommentDraft.findUnique({ where });
      expected(input.expectedVersion, old?.version ?? 0);
      if (old?.deletedAt)
        throw new PortalError(
          409,
          "This draft was already discarded or sent. Keep your unsent text in a new draft."
        );
      if (op === "draft-delete") {
        if (!old) throw new PortalError(404, "This draft is unavailable.");
        const row = await tx.privateCommentDraft.update({
          where,
          data: {
            content: "",
            mentionIds: [],
            deletedAt: new Date(),
            version: { increment: 1 }
          }
        });
        return { id, version: row.version, message: "Draft discarded." };
      }
      const post = await readableConversation(tx, context, input.postId);
      const reply = input.replyToId
        ? await readableComment(tx, context, post.id, input.replyToId)
        : null;
      if (
        old &&
        (old.postId !== post.id || old.replyToId !== (reply?.id ?? null))
      )
        throw new PortalError(
          409,
          "Keep this draft with its original conversation."
        );
      if (typeof input.content !== "string" || input.content.length > 10000)
        throw new PortalError(
          400,
          "Drafts allow up to 10,000 characters. Nothing has been shortened."
        );
      const mentionIds = commentMentionIds(input.mentionIds);
      const authorChurchId = input.authorChurchId
        ? postId(input.authorChurchId)
        : null;
      if (
        authorChurchId &&
        (!context.publishers.has(authorChurchId) ||
          (post.audience === "CHURCH" &&
            post.audienceChurchId !== authorChurchId))
      )
        throw new PortalError(
          403,
          "Choose a church you can currently speak for."
        );
      if (!old) {
        if (
          (await tx.privateCommentDraft.count({
            where: { ownerId, deletedAt: null }
          })) >= 100
        )
          throw new PortalError(
            409,
            "Send or discard a draft before creating another."
          );
        if (
          await tx.privateCommentDraft.findFirst({
            where: {
              ownerId,
              postId: post.id,
              replyToId: reply?.id ?? null,
              deletedAt: null
            },
            select: { id: true }
          })
        )
          throw new PortalError(
            409,
            "A draft already exists for this reply target. Reload it before editing."
          );
      }
      const data = { content: input.content, mentionIds, authorChurchId };
      const row = await tx.privateCommentDraft.upsert({
        where,
        create: { ownerId, id, postId: post.id, replyToId: reply?.id, ...data },
        update: { ...data, version: { increment: 1 } }
      });
      return { id, version: row.version, message: "Private draft saved." };
    }
    const post = await readableConversation(tx, context, input.postId);
    if (op === "create") {
      let draft;
      if (input.draftId) {
        draft = await tx.privateCommentDraft.findUnique({
          where: { ownerId_id: { ownerId, id: socialKey(input.draftId) } }
        });
        if (!draft || draft.deletedAt)
          throw new PortalError(404, "This draft is unavailable.");
        expected(input.draftVersion, draft.version);
        if (
          draft.postId !== post.id ||
          draft.replyToId !== (input.replyToId || null) ||
          draft.authorChurchId !== (input.authorChurchId || null) ||
          draft.content !== input.content ||
          JSON.stringify(draft.mentionIds) !==
            JSON.stringify(commentMentionIds(input.mentionIds))
        )
          throw new PortalError(
            409,
            "Save the current draft before sending it."
          );
      }
      const row = await createCommentIn(tx, context, input);
      if (draft)
        await tx.privateCommentDraft.update({
          where: { ownerId_id: { ownerId, id: draft.id } },
          data: {
            content: "",
            mentionIds: [],
            deletedAt: new Date(),
            version: { increment: 1 }
          }
        });
      return {
        id: row.id,
        version: row.version,
        message: "Comment published."
      };
    }
    if (op === "conversation") {
      if (!["DEFAULT", "FOLLOW", "MUTE"].includes(String(input.mode)))
        throw new PortalError(400, "Choose a supported conversation setting.");
      const where = { ownerId_postId: { ownerId, postId: post.id } },
        old = await tx.conversationPreference.findUnique({ where });
      expected(input.expectedVersion, old?.version ?? 0);
      const row = await tx.conversationPreference.upsert({
        where,
        create: { ownerId, postId: post.id, mode: String(input.mode) },
        update: { mode: String(input.mode), version: { increment: 1 } }
      });
      return {
        id: row.id,
        version: row.version,
        message: "Conversation setting saved."
      };
    }
    if (op === "pin") {
      if (!canPinComment(context, post))
        throw new PortalError(
          403,
          "Only the post owner or a current church publisher or moderator can pin a reply."
        );
      const old = await tx.commentPin.findUnique({
        where: { postId: post.id }
      });
      expected(input.expectedVersion, old?.version ?? 0);
      const comment = input.commentId
        ? await readableComment(tx, context, post.id, input.commentId)
        : null;
      if (comment?.rootId)
        throw new PortalError(400, "Choose a top-level comment to pin.");
      const row = await tx.commentPin.upsert({
        where: { postId: post.id },
        create: { postId: post.id, commentId: comment?.id },
        update: { commentId: comment?.id ?? null, version: { increment: 1 } }
      });
      return {
        id: post.id,
        version: row.version,
        message: comment ? "Helpful reply pinned." : "Reply unpinned."
      };
    }
    const comment = await readableComment(
      tx,
      context,
      post.id,
      input.commentId
    );
    if (op === "like") {
      if (typeof input.desired !== "boolean")
        throw new PortalError(400, "Choose the intended Like state.");
      const where = {
          commentId_userId: { commentId: comment.id, userId: ownerId }
        },
        old = await tx.commentLike.findUnique({ where });
      expected(input.expectedVersion, old?.version ?? 0);
      const row = await tx.commentLike.upsert({
        where,
        create: {
          commentId: comment.id,
          userId: ownerId,
          active: input.desired
        },
        update: { active: input.desired, version: { increment: 1 } }
      });
      return {
        id: comment.id,
        version: row.version,
        message: input.desired ? "Comment liked." : "Like removed."
      };
    }
    if (op !== "edit" && op !== "delete")
      throw new PortalError(400, "Choose a supported comment action.");
    if (!canDeleteComment(context, comment))
      throw new PortalError(
        403,
        "Only the comment author or a current publisher for its speaking church can change this text."
      );
    expected(input.expectedVersion, comment.version);
    if (op === "delete") {
      const row = await deleteCommentIn(tx, comment);
      return { id: row.id, version: row.version, message: "Comment deleted." };
    }
    requireReply(context, post);
    const content = postField(input.content, 1500, 2);
    await updateMentions(
      tx,
      context,
      post.id,
      comment.id,
      commentMentionIds(input.mentionIds)
    );
    const row = await tx.platformPostComment.update({
      where: { id: comment.id },
      data: { content, editedAt: new Date(), version: { increment: 1 } }
    });
    return { id: row.id, version: row.version, message: "Comment updated." };
  });
}
