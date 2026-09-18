import type { PostTx } from "./post-access";
import { recordDomainActivity } from "./domain-activity";

export async function recordGroupActivity(
  tx: PostTx,
  groupId: string,
  actorId: string,
  action: string,
  targetId?: string
) {
  if (
    !targetId ||
    ![
      "APPLY",
      "INVITE",
      "CANCEL_INVITE",
      "MEMBERSHIP_DECISION",
      "OFFER_ROLE",
      "CANCEL_ROLE",
      "REVOKE_ROLE"
    ].includes(action)
  )
    return;
  const row = await tx.gatherGroupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: targetId } }
  });
  if (!row) return;
  const recipients =
    action === "APPLY"
      ? (
          await tx.gatherGroupMembership.findMany({
            where: { groupId, state: "ACTIVE", leader: true },
            select: { userId: true },
            take: 21
          })
        ).map((r) => r.userId)
      : [targetId];
  for (const recipientId of recipients.filter((id) => id !== actorId))
    await recordDomainActivity(tx, {
      kind: action === "APPLY" ? "GROUP_REVIEW" : "GROUP_MEMBERSHIP",
      category: "groups",
      sourceId: row.id,
      sourceVersion: row.version,
      actorId,
      recipientId
    });
}
