// Account entry preserves only known in-app reading/navigation state. Never
// preserve credentials, arbitrary query strings or another authentication page.
export function safeAccountReturn(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 1500 ||
    /[\\\u0000-\u001f\u007f]/.test(value) ||
    !/^\/platform(?:[/?]|$)/.test(value)
  )
    return "/platform";
  const url = new URL(value, "https://return.invalid");
  if (
    url.origin !== "https://return.invalid" ||
    !/^\/platform(?:\/(?:feed|search|menu|settings|calendars(?:\/[a-zA-Z0-9_-]{1,100})?|commitments|events\/[a-zA-Z0-9_-]{1,100}|profile(?:\/(?:me|[a-zA-Z0-9_]{3,24}))?|posts\/[a-zA-Z0-9_-]{1,100}|church-listings(?:\/[a-zA-Z0-9_-]{1,100})?|church-claims(?:\/(?:review(?:\/[a-zA-Z0-9_-]{1,100})?|[a-zA-Z0-9_-]{1,100}))?|churches(?:\/[a-zA-Z0-9_-]{1,100}(?:\/(?:directory|review|overview|calendar|responsibilities|access|structure(?:\/[a-zA-Z0-9_-]{1,100})?|people\/[a-zA-Z0-9_-]{1,100}))?)?|my-church(?:\/sharing)?|help|support(?:\/[a-zA-Z0-9_-]{1,100})?))?\/?$/.test(
      url.pathname
    )
  )
    return "/platform";
  const query = new URLSearchParams();
  if (
    ["/platform/church-listings/new", "/platform/church-claims/new"].includes(
      url.pathname
    )
  ) {
    const churchId = url.searchParams.get("churchId");
    if (churchId && /^[a-zA-Z0-9_-]{1,100}$/.test(churchId))
      query.set("churchId", churchId);
  }
  for (const key of [
    "month",
    "timeZone",
    "q",
    "post",
    "mode",
    "before",
    "cursor",
    "candidateCursor"
  ] as const) {
    const entry = url.searchParams.get(key);
    if (entry && entry.length <= 200 && !/[\u0000-\u001f\u007f]/.test(entry))
      query.set(key, entry);
  }
  return url.pathname + (query.size ? "?" + query.toString() : "");
}

export const accountReasons = {
  calendar: "Join or sign in to manage calendars and respond to events.",
  structure:
    "Join or sign in to view your church responsibilities and structure.",
  claim: "Join or sign in to prepare a church representative request.",
  listing: "Join or sign in to add a church listing.",
  account: "Join or sign in to use your account.",
  profile: "Join or sign in to view member profiles.",
  like: "Join or sign in to like a post.",
  comment: "Join or sign in to add a comment.",
  settings: "Join or sign in to manage your account settings.",
  connection: "Join or sign in to connect with a church.",
  participate: "Join or sign in to take part in the conversation."
};
export type AccountReason = keyof typeof accountReasons;
export function accountReason(value: unknown): AccountReason {
  return typeof value === "string" && Object.hasOwn(accountReasons, value)
    ? (value as AccountReason)
    : "participate";
}
export function accountEntryHref(
  page: "join" | "login" | "signup",
  next: unknown = "/platform",
  reason?: unknown
) {
  if (safeAccountReturn(next) === "/platform" && reason === undefined)
    return `/platform/${page}`;
  return `/platform/${page}?${new URLSearchParams({ next: safeAccountReturn(next), reason: accountReason(reason) })}`;
}
