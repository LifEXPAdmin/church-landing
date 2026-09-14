export const FEED_MODES = ["latest", "friends", "weekly", "trending"] as const;
export type FeedMode = (typeof FEED_MODES)[number];
export const feedChoices: Record<
  FeedMode,
  { label: string; description: string; empty: string }
> = {
  latest: {
    label: "Latest",
    description: "Newest public posts from across the community.",
    empty: "No posts yet."
  },
  friends: {
    label: "Friends",
    description: "Newest posts from your friends.",
    empty: "No posts from your friends yet"
  },
  weekly: {
    label: "Top This Week",
    description: "Most liked in the last 7 days.",
    empty: "No liked posts in the last 7 days yet"
  },
  trending: {
    label: "Trending",
    description: "Popular right now, with more weight on recent likes.",
    empty: "No trending posts yet"
  }
};
export function feedMode(value: unknown): FeedMode | undefined {
  return FEED_MODES.includes(value as FeedMode)
    ? (value as FeedMode)
    : undefined;
}
export const GUEST_FEED_COOKIE = "gc-guest-feed";
