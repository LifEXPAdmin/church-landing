import type { Prisma } from "@prisma/client";
import { PortalError } from "./portal-policy";
import { postId } from "./post-input";
export const adultMemberWhere = (ownerId: string) => ({
  OR: [{ participantAId: ownerId }, { participantBId: ownerId }]
});
export async function ownedAdultConversation(
  tx: Prisma.TransactionClient,
  ownerId: string,
  id: unknown
) {
  const row = await tx.adultConversation.findFirst({
    where: { id: postId(id), ...adultMemberWhere(ownerId) }
  });
  if (!row)
    throw new PortalError(404, "This private conversation is unavailable.");
  return row;
}
export const adultOtherId = (
  row: { participantAId: string; participantBId: string },
  ownerId: string
) => (row.participantAId === ownerId ? row.participantBId : row.participantAId);
export const defaultConversationChoice = {
  version: 0,
  muted: false,
  archived: false,
  readThrough: 0,
  hiddenThrough: 0
};
export async function adultMessageCursor(
  tx: Prisma.TransactionClient,
  conversationId: string,
  id: unknown,
  hiddenThrough: number
) {
  const row = await tx.adultMessage.findFirst({
    where: { id: postId(id), conversationId, sequence: { gt: hiddenThrough } },
    select: { id: true, sequence: true }
  });
  if (!row)
    throw new PortalError(
      409,
      "This message position is unavailable. Refresh the conversation."
    );
  return row;
}
