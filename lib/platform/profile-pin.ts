import type { PrismaClient } from "@prisma/client";
import { expected, PortalError } from "./portal-policy";
import { postContext, withPostRead, type PostTx } from "./post-access";
import { hydratePostPage } from "./post-reads";
import { postId } from "./post-input";
import { socialCommand, socialInput } from "./social-operations";

async function ownedPost(tx: PostTx, ownerId: string | null, id: string) {
  if (!ownerId)
    throw new PortalError(401, "Sign in to manage your profile pin.");
  const row = await tx.platformPost.findFirst({
    where: { id, authorId: ownerId, authorChurchId: null },
    select: { id: true }
  });
  if (!row) throw new PortalError(404, "This personal post is unavailable.");
}

export function readProfilePin(
  db: PrismaClient,
  token: unknown,
  value: unknown
) {
  const id = postId(value);
  return withPostRead(db, token, async (tx, context) => {
    await ownedPost(tx, context.actorId, id);
    const row = await tx.socialPreferences.findUnique({
      where: { ownerId: context.actorId! },
      select: { profilePinPostId: true, profilePinVersion: true }
    });
    const [post] = await hydratePostPage(tx, context, [id]);
    return {
      pinned: row?.profilePinPostId === id,
      replaces: !!row?.profilePinPostId && row.profilePinPostId !== id,
      version: row?.profilePinVersion ?? 0,
      canPin: !!post && (post.repost?.kind !== "PLAIN" || !!post.repost.source)
    };
  });
}

export function saveProfilePin(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, ["postId", "desired", "expectedVersion", "mutationId"]);
  const id = postId(input.postId);
  if (typeof input.desired !== "boolean")
    throw new PortalError(400, "Choose whether to pin this post.");
  const desired = input.desired;
  return socialCommand(
    db,
    token,
    "profile-pin",
    input,
    async (tx, ownerId) => {
      const old = await tx.socialPreferences.findUnique({
        where: { ownerId },
        select: { profilePinVersion: true, profilePinPostId: true }
      });
      expected(input.expectedVersion, old?.profilePinVersion ?? 0);
      if (!desired && old?.profilePinPostId !== id)
        throw new PortalError(
          409,
          "Your profile pin changed. Check its current status."
        );
      const row = await tx.socialPreferences.upsert({
        where: { ownerId },
        create: {
          ownerId,
          profilePinPostId: desired ? id : null,
          profilePinVersion: 1
        },
        update: {
          profilePinPostId: desired ? id : null,
          profilePinVersion: { increment: 1 }
        }
      });
      return {
        id,
        version: row.profilePinVersion,
        message: desired
          ? "Post pinned to your profile."
          : "Post unpinned from your profile."
      };
    },
    async (tx, ownerId) => {
      // Ownership and source access precede even an exact receipt replay.
      await ownedPost(tx, ownerId, id);
      if (desired) {
        const [post] = await hydratePostPage(
          tx,
          await postContext(tx, ownerId),
          [id]
        );
        if (!post || (post.repost?.kind === "PLAIN" && !post.repost.source))
          throw new PortalError(
            404,
            "Only your currently available published posts can be pinned."
          );
      }
    },
    "shared"
  );
}
