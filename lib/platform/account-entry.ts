import { feedMode } from "./feed-options";
import { communityReportTargets } from "./community-report-types";
import { relationshipSearch } from "./relationship-navigation";
import { isSettingsPath } from "./settings-registry";
import { readerDate, readerId } from "./reader-navigation";
import { activityCategories } from "./activity-types";

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
  // Exchange account entry returns to an explicit destination, never a saved
  // action, draft payload, cursor or an automatic publication request.
  if (
    url.origin === "https://return.invalid" &&
    /^\/platform\/exchange(?:\/(?:new|mine|handoffs\/[a-zA-Z0-9_-]{1,100}|[a-zA-Z0-9_-]{1,100}(?:\/(?:edit|needs))?))?\/?$/.test(
      url.pathname
    )
  )
    return url.pathname.replace(/\/$/, "");
  if (
    url.origin === "https://return.invalid" &&
    url.pathname.replace(/\/$/, "") === "/platform/relationships/lists"
  )
    return "/platform/relationships/lists";
  if (
    url.origin === "https://return.invalid" &&
    url.pathname === "/platform/account/authenticator"
  )
    return "/platform/account/authenticator";
  if (
    url.origin !== "https://return.invalid" ||
    !/^\/platform(?:\/(?:notifications\/[a-zA-Z0-9_-]{1,80}|activity|photo-tags|feed|search|share|invitations|invite\/[A-Za-z0-9_-]{43}|features|releases(?:\/[a-zA-Z0-9_-]{1,100})?|menu|getting-started|scheduled-posts(?:\/[a-zA-Z0-9_-]{1,100})?|drafts|comment-drafts|relationships|saved|prayers|topics(?:\/[a-z0-9-]{3,60}(?:\/manage)?)?|reports(?:\/(?:review|decisions))?|messages(?:\/[a-zA-Z0-9_-]{1,100})?|settings(?:\/[a-z]+(?:\/[a-z]+)?)?|calendars(?:\/[a-zA-Z0-9_-]{1,100})?|commitments|events\/[a-zA-Z0-9_-]{1,100}|profile(?:\/(?:me|[a-zA-Z0-9_]{3,24}))?|posts\/[a-zA-Z0-9_-]{1,100}|church-listings(?:\/[a-zA-Z0-9_-]{1,100})?|church-claims(?:\/(?:review(?:\/[a-zA-Z0-9_-]{1,100})?|[a-zA-Z0-9_-]{1,100}))?|churches(?:\/[a-zA-Z0-9_-]{1,100}(?:\/(?:directory|review|overview|calendar|responsibilities|access|welcome|structure(?:\/[a-zA-Z0-9_-]{1,100})?|people\/[a-zA-Z0-9_-]{1,100}))?)?|my-church(?:\/sharing)?|feedback(?:\/(?:requests|cases\/[a-zA-Z0-9_-]{1,100}|ideas(?:\/[a-zA-Z0-9_-]{1,100})?))?|help|support(?:\/[a-zA-Z0-9_-]{1,100})?))?\/?$/.test(
      url.pathname
    )
  )
    return "/platform";
  // Private feedback returns to a destination, never a draft or saved-action query.
  if (/^\/platform\/feedback(?:\/|$)/.test(url.pathname))
    return url.pathname.replace(/\/$/, "");
  if (/^\/platform\/scheduled-posts(?:\/|$)/.test(url.pathname))
    // Return only to the management destination. Cursors, form entries and
    // action parameters belong to the prior session and are never replayed.
    return url.pathname.replace(/\/$/, "");
  if (/^\/platform\/topics(?:\/|$)/.test(url.pathname)) {
    // Membership pages and any unsent action stay account-bound. Authentication
    // returns to a reading/form destination and never performs a topic mutation.
    const topicQuery = new URLSearchParams();
    if (url.pathname.replace(/\/$/, "") === "/platform/topics") {
      const q = url.searchParams.get("q");
      if (q && q.length <= 80 && !/[\u0000-\u001f\u007f]/.test(q))
        topicQuery.set("q", q);
      if (url.searchParams.get("mine") === "1") topicQuery.set("mine", "1");
      if (url.searchParams.get("owned") === "1") topicQuery.set("owned", "1");
    }
    return url.pathname + (topicQuery.size ? "?" + topicQuery : "");
  }
  // Prayer pagination is bound to the current account. Begin its private list anew after account entry.
  if (url.pathname.replace(/\/$/, "") === "/platform/prayers")
    return "/platform/prayers";
  if (
    url.pathname.startsWith("/platform/settings") &&
    !isSettingsPath(url.pathname)
  )
    return "/platform";
  const query = new URLSearchParams();
  if (
    ["/platform", "/platform/feed"].includes(url.pathname.replace(/\/$/, ""))
  ) {
    const mode = feedMode(url.searchParams.get("feed"));
    if (mode) query.set("feed", mode);
    // Snapshot cursors are account-bound. Account entry begins a fresh set.
  }
  if (
    url.pathname.replace(/\/$/, "") === "/platform/commitments" &&
    url.searchParams.has("signup")
  ) {
    const signup = readerId(url.searchParams.get("signup"));
    return "/platform/commitments" + (signup ? "?signup=" + signup : "");
  }
  if (url.pathname.replace(/\/$/, "") === "/platform/photo-tags") {
    if (url.searchParams.get("view") === "preferences")
      query.set("view", "preferences");
    else {
      for (const key of ["tag", "photo", "profile"]) {
        const value = readerId(url.searchParams.get(key));
        if (value) {
          query.set(key, value);
          break;
        }
      }
      if (!query.size && url.searchParams.get("scope") === "sent")
        query.set("scope", "sent");
    }
    return "/platform/photo-tags" + (query.size ? "?" + query : "");
  }
  if (url.pathname.replace(/\/$/, "") === "/platform/activity") {
    const category = url.searchParams.get("category");
    if (category && activityCategories.some((value) => value === category))
      query.set("category", category);
    if (url.searchParams.get("filter") === "unread")
      query.set("filter", "unread");
    return "/platform/activity" + (query.size ? "?" + query : "");
  }
  if (
    /^\/platform\/profile\/(?:me|[a-zA-Z0-9_]{3,24})\/?$/.test(url.pathname) &&
    url.searchParams.get("tab") === "photos"
  )
    query.set("tab", "photos");
  if (url.pathname === "/platform/search") {
    const kind = url.searchParams.get("kind");
    if (
      kind &&
      ["posts", "people", "churches", "events", "topics"].includes(kind)
    )
      query.set("kind", kind);
    const after = url.searchParams.get("after");
    if (after && /^[a-zA-Z0-9_-]{1,256}$/.test(after))
      query.set("after", after);
    for (const key of ["topic", "churchId"]) {
      const value = readerId(url.searchParams.get(key));
      if (value) query.set(key, value);
    }
  }
  if (url.pathname === "/platform/saved") {
    for (const key of ["collectionId", "after"]) {
      const value = readerId(url.searchParams.get(key));
      if (value) query.set(key, value);
    }
  }
  // Next redirects trailing slashes, so sanitize their query exactly like the
  // canonical private route before returning through account entry.
  const messagePath = url.pathname.replace(/\/$/, "");
  if (messagePath === "/platform/messages/requests") {
    const recipientId = readerId(url.searchParams.get("recipientId")),
      id = readerId(url.searchParams.get("id")),
      after = readerId(url.searchParams.get("after"));
    if (recipientId) query.set("recipientId", recipientId);
    else if (id) query.set("id", id);
    else {
      if (url.searchParams.get("view") === "sent") query.set("view", "sent");
      if (after) query.set("after", after);
    }
    return messagePath + (query.size ? "?" + query.toString() : "");
  }
  if (/^\/platform\/messages(?:\/[a-zA-Z0-9_-]{1,100})?$/.test(messagePath)) {
    if (url.searchParams.get("archived") === "true")
      query.set("archived", "true");
    const after = readerId(url.searchParams.get("after"));
    if (after) query.set("after", after);
    if (messagePath !== "/platform/messages") {
      const message = readerId(url.searchParams.get("message"));
      if (message) query.set("message", message);
    }
    return messagePath + (query.size ? "?" + query.toString() : "");
  }
  const reportPath = url.pathname.replace(/\/$/, "");
  if (
    reportPath === "/platform/reports/review" ||
    reportPath === "/platform/reports/decisions"
  ) {
    for (const key of ["id", "after"]) {
      const value = readerId(url.searchParams.get(key));
      if (value) query.set(key, value);
    }
    if (
      reportPath === "/platform/reports/review" &&
      url.searchParams.get("status") === "CLOSED"
    )
      query.set("status", "CLOSED");
    return reportPath + (query.size ? "?" + query : "");
  }
  if (reportPath === "/platform/reports") {
    const type = url.searchParams.get("targetType"),
      target = readerId(url.searchParams.get("targetId"));
    if (
      type &&
      communityReportTargets.some((value) => value === type) &&
      target
    ) {
      query.set("targetType", type);
      query.set("targetId", target);
    } else {
      for (const key of ["receipt", "after"]) {
        const value = readerId(url.searchParams.get(key));
        if (value) query.set(key, value);
      }
    }
    return reportPath + (query.size ? "?" + query : "");
  }
  if (url.pathname === "/platform/relationships") {
    const view = url.searchParams.get("view"),
      after = readerId(url.searchParams.get("after"));
    if (
      view &&
      ["following", "favorites", "muted", "blocked", "churches"].includes(view)
    )
      query.set("view", view);
    if (after) query.set("after", after);
    const search = relationshipSearch(view ?? "", url.searchParams.get("q"));
    if (search) query.set("q", search);
  }
  if (/^\/platform\/posts\/[a-zA-Z0-9_-]{1,100}\/?$/.test(url.pathname)) {
    const comment = readerId(url.searchParams.get("comment"));
    if (comment) query.set("comment", comment);
  }
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
    if (key === "q" && url.pathname === "/platform/relationships") continue;
    const entry = url.searchParams.get(key);
    if (entry && entry.length <= 200 && !/[\u0000-\u001f\u007f]/.test(entry))
      query.set(key, entry);
  }
  if (/^\/platform\/?$/.test(url.pathname)) {
    const through = readerDate(url.searchParams.get("through"));
    const anchor = readerId(url.searchParams.get("anchor"));
    if (through && anchor) {
      query.set("through", through.toISOString());
      query.set("anchor", anchor);
    }
  }
  return url.pathname + (query.size ? "?" + query.toString() : "");
}

export const accountReasons = {
  topic: "Join or sign in to create, join or follow a topic community.",
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
