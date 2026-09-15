import { recordDomainActivity } from "./domain-activity";
import type { PrismaClient } from "@prisma/client";
import { expected, PortalError } from "./portal-policy";
import { postContext, withPostRead } from "./post-access";
import { postId as parsePostId } from "./post-input";
import { postInteractionIdIn } from "./post-reads";
import { socialCommand, socialInput } from "./social-operations";
import { socialUserWhere } from "./social-policy";
import {
  requireUnrestrictedTopicPost,
  topicPostReference
} from "./topic-policy";

export function readPostLike(
  db: PrismaClient,
  token: unknown,
  postId: unknown
) {
  return withPostRead(db, token, async (tx, context) => {
    const id = await postInteractionIdIn(tx, context, parsePostId(postId));
    const [own, count] = await Promise.all([
      context.actorId
        ? tx.platformPostLike.findUnique({
            where: { postId_userId: { postId: id, userId: context.actorId } }
          })
        : null,
      tx.platformPostLike.count({
        where: { postId: id, active: true, user: socialUserWhere(context) }
      })
    ]);
    return {
      id,
      liked: own?.active ?? false,
      version: own?.version ?? 0,
      count
    };
  });
}

export function postLikeCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, ["postId", "mutationId", "expectedVersion", "desired"]);
  if (typeof input.desired !== "boolean")
    throw new PortalError(400, "Choose the intended Like state.");
  const desired = input.desired;
  return socialCommand(
    db,
    token,
    "post-like",
    input,
    async (tx, ownerId) => {
      const context = await postContext(tx, ownerId);
      const id = await postInteractionIdIn(
        tx,
        context,
        parsePostId(input.postId)
      );
      if (desired) await requireUnrestrictedTopicPost(tx, context, id);
      const where = { postId_userId: { postId: id, userId: ownerId } };
      const old = await tx.platformPostLike.findUnique({ where });
      expected(input.expectedVersion, old?.version ?? 0);
      const row = await tx.platformPostLike.upsert({
        where,
        create: {
          postId: id,
          userId: ownerId,
          active: desired,
          firstLikedAt: desired ? new Date() : null
        },
        update: {
          active: desired,
          version: { increment: 1 },
          // A known first Like is never renewed by toggling or retrying. For an
          // initially inactive/unknown row, record only a real new activation.
          ...(desired && old && !old.active && !old.firstLikedAt
            ? { firstLikedAt: new Date() }
            : {})
        }
      });
      if (desired && !old?.active) {
        const post = await tx.platformPost.findUniqueOrThrow({
          where: { id },
          select: { authorId: true, authorChurchId: true }
        });
        if (!post.authorChurchId)
          await recordDomainActivity(tx, {
            kind: "POST_REACTION",
            category: "reactions",
            sourceId: row.id,
            sourceVersion: row.version,
            actorId: ownerId,
            recipientId: post.authorId,
            postId: id,
            once: true
          });
      }
      return {
        id,
        version: row.version,
        message: desired ? "Post liked." : "Like removed."
      };
    },
    async (tx, ownerId) => {
      if (
        desired &&
        (await topicPostReference(tx, parsePostId(input.postId)))
      ) {
        const context = await postContext(tx, ownerId);
        const id = await postInteractionIdIn(
          tx,
          context,
          parsePostId(input.postId)
        );
        await requireUnrestrictedTopicPost(tx, context, id);
      }
    },
    "shared"
  );
}
