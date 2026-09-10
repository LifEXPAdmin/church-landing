import type { Prisma, PrismaClient } from "@prisma/client";
import { activePublicAccount } from "./public-profile";

export function homeFeedMode() {
  return process.env.PLATFORM_HOME_FEED_MODE === "following"
    ? "following"
    : "community";
}

// The current PlatformPost model contains public community posts only. Future
// audience-aware readers must keep their eligibility checks before this filter.
export async function homeFeedAudience(
  db: PrismaClient,
  userId?: string,
  mode = homeFeedMode()
): Promise<Prisma.PlatformPostWhereInput> {
  if (!userId || mode !== "following") return { author: activePublicAccount };
  const following = await db.platformFollow.findMany({
    where: { followerId: userId, following: activePublicAccount },
    select: { followingId: true }
  });
  return {
    author: activePublicAccount,
    authorId: { in: [userId, ...following.map((row) => row.followingId)] }
  };
}
