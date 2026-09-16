import type { Prisma } from "@prisma/client";
import { PortalError } from "./portal-policy";
import {
  storedFollowingLists,
  type FollowingListEntry
} from "./following-list-options";

export const followingListsSelect = {
  followingLists: true,
  followingListsVersion: true,
  followingListsRecoveryRequired: true
} as const;
export type FollowingListsPreference =
  | {
      followingLists: unknown;
      followingListsVersion: number;
      followingListsRecoveryRequired: boolean;
    }
  | null
  | undefined;

/** A relation epoch is a filter, never a grant. The caller retains all read policy. */
export function followingListPostWhere(
  ownerId: string,
  members: FollowingListEntry[]
): Prisma.PlatformPostWhereInput {
  const people = members
    .filter((m) => m.kind === "person")
    .map((m) => m.relationshipId);
  return {
    OR: [
      {
        authorChurchId: null,
        author: {
          followers: { some: { followerId: ownerId, id: { in: people } } }
        }
      },
      ...members
        .filter((m) => m.kind === "church")
        .map((m) => ({
          authorChurchId: m.targetId,
          authorChurch: {
            socialRelations: {
              some: {
                id: m.relationshipId,
                ownerId,
                followingChurch: true,
                followingSince: m.since === null ? null : new Date(m.since)
              }
            }
          }
        }))
    ]
  };
}
export function followingFeedSelection(
  ownerId: string | null,
  row: FollowingListsPreference
) {
  if (!ownerId)
    return { key: null, where: {}, selectedId: null, lists: [], version: 0 };
  if (row?.followingListsRecoveryRequired)
    throw new PortalError(
      409,
      "Review your private following lists after recovery before reopening Following. Other feeds remain available."
    );
  const value = storedFollowingLists(row?.followingLists);
  const selected = value.lists.find((list) => list.id === value.selectedId);
  if (value.selectedId && !selected)
    throw new PortalError(
      409,
      "Your selected private list was deleted. Choose another list or All following in Private following lists."
    );
  return {
    key: selected ? [selected.id, row?.followingListsVersion ?? 0] : null,
    where: selected ? followingListPostWhere(ownerId, selected.members) : {},
    selectedId: value.selectedId,
    lists: value.lists.map(({ id, name }) => ({ id, name })),
    version: row?.followingListsVersion ?? 0
  };
}
