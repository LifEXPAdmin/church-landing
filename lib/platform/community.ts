import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { postCommandIn } from "./post-commands";
import {
  postContext,
  postCanReply,
  postReadableWhere,
  postField
} from "./post-access";
import { PortalError } from "./portal";
import { withOwnedSession } from "./account-sessions";
import { activePublicAccount } from "./public-profile";

type CommunityOperation =
  | "post"
  | "delete-post"
  | "follow"
  | "unfollow"
  | "like"
  | "comment"
  | "delete-comment";

// All writes recheck the session under the same gate as suspension, lifecycle
// and church/support assignments. No request-supplied actor identity is used.
export async function communityCommand(
  db: PrismaClient,
  token: unknown,
  operation: CommunityOperation,
  input: Record<string, unknown>
) {
  return withOwnedSession(
    db,
    token,
    async (tx, current) => {
      const actorId = current.userId;
      const value = (key: string, max: number) =>
        typeof input[key] === "string" ? input[key].trim().slice(0, max) : "";
      const postId = value("postId", 100);
      const targetId = value("followingId", 100);
      const context = await postContext(tx, actorId);
      if (operation === "post") {
        return postCommandIn(tx, context, {
          ...input,
          operation: "create",
          requestKey: input.requestKey ?? randomUUID()
        });
      } else if (operation === "delete-post") {
        return postCommandIn(tx, context, {
          operation: "withdraw",
          postId,
          expectedVersion:
            typeof input.expectedVersion === "string"
              ? Number(input.expectedVersion)
              : input.expectedVersion,
          confirmed: input.confirmed === true || input.confirmed === "on"
        });
      } else if (operation === "unfollow") {
        await tx.platformFollow.deleteMany({
          where: { followerId: actorId, followingId: targetId }
        });
      } else if (operation === "follow") {
        if (
          !targetId ||
          targetId === actorId ||
          !(await tx.platformUser.findFirst({
            where: { id: targetId, ...activePublicAccount },
            select: { id: true }
          }))
        )
          return;
        await tx.platformFollow.upsert({
          where: {
            followerId_followingId: {
              followerId: actorId,
              followingId: targetId
            }
          },
          create: { followerId: actorId, followingId: targetId },
          update: {}
        });
      } else if (operation === "delete-comment") {
        await tx.platformPostComment.deleteMany({
          where: { id: value("commentId", 100), authorId: actorId }
        });
      } else {
        const post = postId
          ? await tx.platformPost.findFirst({
              where: { AND: [{ id: postId }, postReadableWhere(context)] }
            })
          : null;
        if (!post) return;
        if (operation === "like") {
          const where = { postId_userId: { postId, userId: actorId } };
          if (await tx.platformPostLike.findUnique({ where }))
            await tx.platformPostLike.delete({ where });
          else
            await tx.platformPostLike.create({
              data: { postId, userId: actorId }
            });
        } else if (operation === "comment") {
          if (!postCanReply(context, post))
            throw new PortalError(
              403,
              "Replies are closed or limited to approved church members."
            );
          const content = postField(input.content, 400, 2);
          if (content.length >= 2)
            await tx.platformPostComment.create({
              data: { postId, authorId: actorId, content }
            });
        }
      }
    },
    true
  );
}
