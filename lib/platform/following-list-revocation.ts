import { Prisma } from "@prisma/client";
import { storedFollowingLists } from "./following-list-options";
import { recordDiscoveryControl } from "./retention-controls";

/** Delete revoked membership and journal its version in the owning transaction. */
export async function pruneFollowingLists(
  tx: Prisma.TransactionClient,
  targets: Array<{
    ownerId: string;
    kind: "person" | "church";
    targetId: string;
  }>
) {
  const byOwner = new Map<string, Set<string>>();
  for (const target of targets) {
    const set = byOwner.get(target.ownerId) ?? new Set<string>();
    set.add(target.kind + ":" + target.targetId);
    byOwner.set(target.ownerId, set);
  }
  if (!byOwner.size) return;
  const rows = await tx.socialPreferences.findMany({
    where: {
      ownerId: { in: [...byOwner.keys()] },
      followingLists: { not: Prisma.DbNull }
    },
    select: { ownerId: true, followingLists: true }
  });
  for (const row of rows) {
    const value = storedFollowingLists(row.followingLists),
      removals = byOwner.get(row.ownerId)!;
    let changed = false;
    for (const list of value.lists) {
      const members = list.members.filter(
        (m) => !removals.has(m.kind + ":" + m.targetId)
      );
      changed ||= members.length !== list.members.length;
      list.members = members;
    }
    if (!changed) continue;
    const saved = await tx.socialPreferences.update({
      where: { ownerId: row.ownerId },
      data: {
        followingLists: value as unknown as Prisma.InputJsonObject,
        followingListsVersion: { increment: 1 }
      },
      select: { followingListsVersion: true }
    });
    await recordDiscoveryControl(
      tx,
      "FOLLOWING_LISTS",
      row.ownerId,
      row.ownerId,
      saved.followingListsVersion
    );
  }
}
