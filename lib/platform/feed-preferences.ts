import type { Prisma, PrismaClient } from "@prisma/client";
import { expected, PortalError } from "./portal-policy";
import { feedMode } from "./feed-options";
import { socialCommand, socialInput } from "./social-operations";
import { followingListsSelect } from "./following-list-policy";
import {
  followingListReference,
  storedFollowingLists
} from "./following-list-options";
import { recordDiscoveryControl } from "./retention-controls";
import { protectDiscoveryRecovery } from "./discovery-recovery";
export function saveFeedPreference(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "mode",
    "mutationId",
    "expectedVersion",
    "followingListId",
    "expectedListsVersion"
  ]);
  const mode = feedMode(input.mode);
  if (!mode) throw new PortalError(400, "Choose a supported feed.");
  const choosingList = input.followingListId !== undefined;
  if (
    choosingList &&
    (mode !== "following" ||
      (input.followingListId !== null &&
        !followingListReference(input.followingListId)))
  )
    throw new PortalError(
      400,
      "Choose All following or one of your private lists for Following."
    );
  if (!choosingList && input.expectedListsVersion !== undefined)
    throw new PortalError(
      400,
      "A list version belongs to an explicit following list choice."
    );
  const command = socialCommand(
    db,
    token,
    "feed-choice",
    input,
    async (tx, ownerId) => {
      const old = await tx.socialPreferences.findUnique({
        where: { ownerId },
        select: {
          feedVersion: true,
          ...(choosingList ? followingListsSelect : {})
        }
      });
      expected(input.expectedVersion, old?.feedVersion ?? 0);
      const lists = choosingList
        ? storedFollowingLists(old?.followingLists)
        : null;
      if (lists) {
        expected(input.expectedListsVersion, old?.followingListsVersion ?? 0);
        if (old?.followingListsRecoveryRequired)
          throw new PortalError(
            409,
            "Review and reset private following lists after recovery before choosing a feed list."
          );
        if (
          input.followingListId !== null &&
          !lists.lists.some((l) => l.id === input.followingListId)
        )
          throw new PortalError(
            404,
            "This private list is unavailable. Reload your current lists."
          );
        lists.selectedId = input.followingListId as string | null;
      }
      const listData = lists
        ? {
            followingLists: lists as unknown as Prisma.InputJsonObject,
            followingListsVersion: (old?.followingListsVersion ?? 0) + 1
          }
        : {};
      const row = await tx.socialPreferences.upsert({
        where: { ownerId },
        create: { ownerId, feedMode: mode, feedVersion: 1, ...listData },
        update: { feedMode: mode, feedVersion: { increment: 1 }, ...listData },
        select: { feedVersion: true, followingListsVersion: true }
      });
      if (lists)
        await recordDiscoveryControl(
          tx,
          "FOLLOWING_LISTS",
          ownerId,
          ownerId,
          row.followingListsVersion
        );
      return {
        id: ownerId,
        version: row.feedVersion,
        message: "Feed choice saved."
      };
    },
    undefined,
    choosingList ? "exclusive" : "shared"
  );
  return command.then(async (result) => {
    if (choosingList && !(await protectDiscoveryRecovery(db, result.id)))
      throw new PortalError(
        503,
        "Your feed choice is saved; protected recovery needs confirmation. Retry the same choice."
      );
    return result;
  });
}
