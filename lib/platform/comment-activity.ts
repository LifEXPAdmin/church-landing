import type { Prisma } from "@prisma/client";
import { enqueueNotification } from "./notification-outbox";
import { commentNotificationSource } from "./comment-notification-source";

// One recipient intent per canonical comment, even when a reply also mentions
// that recipient. Edits and new devices never replay an old notification.
export async function recordCommentActivity(
  tx: Prisma.TransactionClient,
  actorId: string,
  postId: string,
  commentId: string,
  recipientId: string
) {
  if (actorId === recipientId) return;
  const key = `comment-recipient:${commentId}:${recipientId}`;
  if (await tx.socialEvent.findUnique({ where: { key }, select: { id: true } }))
    return;
  if (
    !(await commentNotificationSource(
      tx,
      { actorId, recipientId, postId, commentId },
      false
    ))
  )
    return;
  const event = await tx.socialEvent.create({
    data: {
      key,
      kind: "COMMENT_ACTIVITY",
      actorId,
      postId,
      commentId,
      recipientId
    }
  });
  await enqueueNotification(tx, event);
}
