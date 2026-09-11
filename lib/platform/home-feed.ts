export function homeFeedMode(): "community" | "following" {
  return process.env.PLATFORM_HOME_FEED_MODE === "following"
    ? "following"
    : "community";
}
