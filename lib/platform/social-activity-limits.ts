import type { Prisma } from "@prisma/client";
import { accountConfig } from "./account-config";
import { activityBudget } from "./account-limits";
import { PortalError } from "./portal-policy";

const limits = {
  post: {
    variable: "COMMUNITY_POSTS_PER_HOUR",
    initial: 10,
    ceiling: 100,
    seconds: 3600,
    label: "posting",
    retained: "Keep your draft."
  },
  comment: {
    variable: "COMMUNITY_COMMENTS_PER_10_MINUTES",
    initial: 30,
    ceiling: 300,
    seconds: 600,
    label: "comment",
    retained: "Keep your text."
  },
  follow: {
    variable: "COMMUNITY_FOLLOWS_PER_HOUR",
    initial: 30,
    ceiling: 300,
    seconds: 3600,
    label: "follow",
    retained: "Your existing choices are unchanged."
  }
} as const;

function configuredMaximum(activity: keyof typeof limits) {
  const limit = limits[activity];
  const value = Number(process.env[limit.variable] ?? limit.initial);
  return Number.isSafeInteger(value) && value >= 1 && value <= limit.ceiling
    ? value
    : null;
}

export function socialActivityConfiguration() {
  return {
    postsPerHour: configuredMaximum("post"),
    commentsPer10Minutes: configuredMaximum("comment"),
    followsPerHour: configuredMaximum("follow")
  };
}

/** New committed activity only, after authority and exact receipt replay.
 * The caller's transaction rolls back this hit if the action cannot complete.
 * Per-account keys reuse the current limiter; no shared-IP activity quota.
 */
export async function requireSocialActivity(
  tx: Prisma.TransactionClient,
  ownerId: string,
  activity: keyof typeof limits
) {
  const limit = limits[activity];
  const maximum = configuredMaximum(activity);
  if (maximum === null)
    throw new PortalError(
      503,
      `This ${limit.label} action is temporarily unavailable. ${limit.retained}`
    );
  const retryAfter = await activityBudget(
    tx,
    accountConfig().rateSecret,
    ownerId,
    `community-${activity}`,
    maximum,
    limit.seconds
  );
  if (retryAfter)
    throw new PortalError(
      429,
      `You have reached the ${limit.label} limit. ${limit.retained} Try again in ${Math.ceil(retryAfter / 60)} minute${retryAfter > 60 ? "s" : ""}.`,
      retryAfter
    );
}
