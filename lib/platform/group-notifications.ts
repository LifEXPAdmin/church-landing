import type { SocialEvent } from "@prisma/client";
import type { PostContext, PostTx } from "./post-access";
import type { NotificationSource } from "./notification-source";
import {
  currentGroupInvitation,
  groupSourceAvailable,
  groupAdultWhere
} from "./group-policy";

export async function groupNotificationSources(
  tx: PostTx,
  events: SocialEvent[],
  context: PostContext,
  channel: string
) {
  const result = new Map<string, NotificationSource>();
  if (
    !events.length ||
    events.length > 50 ||
    !context.actorId ||
    !context.eligible ||
    channel === "EMAIL"
  )
    return result;
  const rows = await tx.gatherGroupMembership.findMany({
    where: {
      id: { in: events.flatMap((e) => (e.sourceId ? [e.sourceId] : [])) }
    },
    include: { group: true },
    take: 50
  });
  const sources = new Map<string, boolean>();
  const actors = new Set(
    (
      await tx.platformUser.findMany({
        where: {
          AND: [groupAdultWhere, { id: { in: events.map((e) => e.actorId) } }]
        },
        select: { id: true },
        take: 50
      })
    ).map((a) => a.id)
  );
  for (const event of events) {
    const row = rows.find((r) => r.id === event.sourceId);
    if (
      !row ||
      row.version !== event.sourceVersion ||
      event.recipientId !== context.actorId ||
      event.actorId === context.actorId ||
      !actors.has(event.actorId) ||
      context.mutedIds?.includes(event.actorId) ||
      context.blockedIds?.includes(event.actorId) ||
      event.notificationCategory !== "groups"
    )
      continue;
    if (!sources.has(row.groupId))
      sources.set(
        row.groupId,
        await groupSourceAvailable(tx, row.group, context)
      );
    if (!sources.get(row.groupId)) continue;
    if (event.kind === "GROUP_REVIEW") {
      if (
        row.state !== "PENDING" ||
        !context.groupModerators?.has(row.groupId) ||
        context.blockedIds?.includes(row.userId)
      )
        continue;
      result.set(event.id, {
        category: "groups",
        href: `/platform/groups/${row.group.slug}/manage`,
        group: `group-review:${row.groupId}`,
        summary: "A group membership request is ready for review."
      });
    } else if (event.kind === "GROUP_MEMBERSHIP") {
      if (row.userId !== context.actorId) continue;
      if (
        row.state === "INVITED" &&
        !(await currentGroupInvitation(tx, row.group, row))
      )
        continue;
      if (
        row.pendingRole &&
        (!row.offerExpiresAt ||
          row.offerExpiresAt <= new Date() ||
          row.offerGroupVersion !== row.group.version ||
          row.offeredById !== row.group.ownerId ||
          context.blockedIds?.includes(row.offeredById ?? ""))
      )
        continue;
      result.set(event.id, {
        category: "groups",
        href:
          context.groupReaders?.has(row.groupId) || row.state === "INVITED"
            ? `/platform/groups/${row.group.slug}`
            : "/platform/groups/mine",
        group: `group-membership:${row.id}`,
        summary: "Your group membership or leadership choice has an update."
      });
    }
  }
  return result;
}
