import { DISCOVERY_MODES } from "./discovery-options";
export const FEED_MODES = [
  "latest",
  "friends",
  "weekly",
  "trending",
  ...DISCOVERY_MODES
] as const;
export type FeedMode = (typeof FEED_MODES)[number];
export const feedChoices: Record<
  FeedMode,
  { label: string; description: string; empty: string }
> = {
  "for-you": {
    label: "For You",
    description:
      "Public posts ordered by your explicit follows, interests and feedback.",
    empty: "No posts match your discovery choices yet"
  },
  following: {
    label: "Following",
    description: "Newest posts from people and churches you follow.",
    empty: "No matching posts from your follows yet"
  },
  "your-church": {
    label: "Your Church",
    description:
      "Posts from and explicitly shared with your selected approved church.",
    empty: "No matching posts from your selected church yet"
  },
  churches: {
    label: "Churches",
    description: "Public posts from churches you follow.",
    empty: "No matching public posts from your followed churches yet"
  },
  local: {
    label: "Local",
    description:
      "Public posts whose authors chose to share a broad locality near your selected area.",
    empty: "No public posts match this area and your filters yet"
  },
  public: {
    label: "Public",
    description:
      "Public discovery with your explicit location, language and topic filters.",
    empty: "No public posts match these discovery choices yet"
  },
  favorites: {
    label: "Favorites",
    description:
      "Newest posts from followed people and churches you privately marked as favorites.",
    empty: "No matching posts from your current favorites yet"
  },
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
