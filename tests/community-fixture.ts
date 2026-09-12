// Older scenario fixtures now exercise the canonical versioned services.
// This adapter is test-only; there is no generic community mutation endpoint.
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { withOwnedSession } from "../lib/platform/account-sessions";
import { postCommand } from "../lib/platform/post-commands";
import { commentCommand } from "../lib/platform/comment-commands";
import { relationshipCommand } from "../lib/platform/relationships";
import { postLikeCommand, readPostLike } from "../lib/platform/post-likes";
export async function communityCommand(
  db: PrismaClient,
  token: unknown,
  operation: string,
  input: Record<string, unknown>
) {
  const ownerId = await withOwnedSession(
    db,
    token,
    async (_, session) => session.userId
  );
  if (operation === "post" || operation === "delete-post")
    return postCommand(db, token, {
      ...input,
      operation: operation === "post" ? "create" : "withdraw",
      ...(operation === "post"
        ? { requestKey: input.requestKey ?? randomUUID() }
        : {})
    });
  if (operation === "comment" || operation === "delete-comment")
    return commentCommand(db, token, {
      ...input,
      operation: operation === "comment" ? "create" : "delete",
      mutationId: randomUUID()
    });
  if (operation === "like") {
    const state = await readPostLike(db, token, input.postId);
    return postLikeCommand(db, token, {
      postId: input.postId,
      mutationId: randomUUID(),
      expectedVersion: state.version,
      desired: !state.liked
    });
  }
  const targetId = String(input.followingId);
  const old = await db.socialRelationship.findFirst({
    where: { ownerId, targetUserId: targetId }
  });
  return relationshipCommand(db, token, {
    operation: "follow",
    kind: "person",
    targetId,
    mutationId: randomUUID(),
    expectedVersion: old?.version ?? 0,
    desired: operation === "follow"
  });
}
