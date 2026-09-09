import { PlatformPostType, type PrismaClient } from "@prisma/client";
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
      if (operation === "post") {
        const content = value("content", 900);
        const type = (value("type", 20) as PlatformPostType) || "UPDATE";
        if (
          content.length < 3 ||
          !Object.values(PlatformPostType).includes(type)
        )
          return;
        await tx.platformPost.create({
          data: {
            authorId: actorId,
            content,
            scripture: value("scripture", 120) || null,
            type
          }
        });
      } else if (operation === "delete-post") {
        await tx.platformPost.deleteMany({
          where: { id: postId, authorId: actorId }
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
        if (
          !postId ||
          !(await tx.platformPost.findFirst({
            where: { id: postId, author: activePublicAccount },
            select: { id: true }
          }))
        )
          return;
        if (operation === "like") {
          const where = { postId_userId: { postId, userId: actorId } };
          if (await tx.platformPostLike.findUnique({ where }))
            await tx.platformPostLike.delete({ where });
          else
            await tx.platformPostLike.create({
              data: { postId, userId: actorId }
            });
        } else if (operation === "comment") {
          const content = value("content", 400);
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
