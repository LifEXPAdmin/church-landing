/** Address data only. A destination never grants access, availability or permission to share. */
const screenPaths = Object.freeze({
  music: "/platform/music",
  artistStudio: "/platform/music/studio",
  media: "/platform/media",
  mediaStudio: "/platform/media/studio",
  mediaPlaylists: "/platform/media/playlists",
  savedMedia: "/platform/media/saved",
  home: "/platform",
  churches: "/platform/churches",
  myChurch: "/platform/my-church",
  explore: "/platform/search",
  messages: "/platform/messages",
  menu: "/platform/menu",
  exchange: "/platform/exchange",
  groups: "/platform/groups",
  topics: "/platform/topics",
  followedTopics: "/platform/topics/following",
  features: "/platform/features",
  releases: "/platform/releases",
  feed: "/platform/feed",
  profile: "/platform/profile/me",
  editProfile: "/platform/profile/me",
  activity: "/platform/activity",
  saved: "/platform/saved",
  drafts: "/platform/drafts",
  prayers: "/platform/prayers",
  calendars: "/platform/calendars",
  commitments: "/platform/commitments",
  volunteers: "/platform/serve",
  settings: "/platform/settings",
  sharing: "/platform/my-church/sharing",
  helpRequests: "/platform/help/requests",
  feedback: "/platform/feedback",
  reports: "/platform/reports",
  contactRequests: "/platform/messages/requests",
  help: "/platform/help",
  admin: "/platform/admin",
  mission: "/about#our-mission",
  privacy: "/privacy",
  terms: "/terms",
  qr: "/platform/share?qr=1",
  invitations: "/platform/invitations"
} as const);

export type ScreenId = keyof typeof screenPaths;
export type NavigationId = Exclude<ScreenId, "invitations">;
export type ResourceDestination =
  | { kind: "post"; postId: string }
  | { kind: "comment"; postId: string; commentId: string }
  | { kind: "church"; churchId: string }
  | { kind: "event"; occurrenceId: string }
  | { kind: "profile"; username: string }
  | { kind: "topic"; slug: string };
export type ShareKind = ResourceDestination["kind"];
export type AppDestination =
  | { kind: "screen"; screen: ScreenId }
  | ResourceDestination;

export function screenWebPath<T extends ScreenId>(
  screen: T
): (typeof screenPaths)[T] {
  return screenPaths[screen];
}

const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);

/** Parse identifiers, without looking up a resource or carrying caller-supplied authority. */
export function resourceDestination(
  kind: unknown,
  id: unknown,
  commentId?: unknown
): ResourceDestination | null {
  if (!validId(id)) return null;
  switch (kind) {
    case "post":
      return { kind, postId: id };
    case "comment":
      return validId(commentId) ? { kind, postId: id, commentId } : null;
    case "church":
      return { kind, churchId: id };
    case "event":
      return { kind, occurrenceId: id };
    case "profile":
      return { kind, username: id };
    case "topic":
      return id.length >= 3 &&
        id.length <= 60 &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)
        ? { kind, slug: id }
        : null;
    default:
      return null;
  }
}

/** Web adapter. Resource identity stays distinct from the website's URL vocabulary. */
export function destinationWebPath(destination: AppDestination): string | null {
  switch (destination.kind) {
    case "screen":
      return Object.hasOwn(screenPaths, destination.screen)
        ? screenWebPath(destination.screen)
        : null;
    case "post":
      return validId(destination.postId)
        ? `/platform/posts/${destination.postId}`
        : null;
    case "comment":
      return validId(destination.postId) && validId(destination.commentId)
        ? `/platform/posts/${destination.postId}?comment=${destination.commentId}`
        : null;
    case "church":
      return validId(destination.churchId)
        ? `/platform/churches/${destination.churchId}`
        : null;
    case "event":
      return validId(destination.occurrenceId)
        ? `/platform/events/${destination.occurrenceId}`
        : null;
    case "profile":
      return validId(destination.username)
        ? `/platform/profile/${destination.username}`
        : null;
    case "topic":
      return resourceDestination("topic", destination.slug)
        ? `/platform/topics/${destination.slug}`
        : null;
    default:
      return null;
  }
}

const unsafeCharacters = /[\u0000-\u0020\u007f\\]/;

/**
 * Narrow incoming-link contract. Platform adapters validate the trusted HTTPS
 * origin first, then pass the raw path here before any URL normalization.
 * Only destination identity survives. Query actions, tokens and private cursors
 * never become navigation state. This does not replace safeAccountReturn.
 */
export function parseDestinationPath(value: unknown): AppDestination | null {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    unsafeCharacters.test(value)
  )
    return null;
  const hashAt = value.indexOf("#");
  const hash = hashAt < 0 ? "" : value.slice(hashAt + 1);
  const withoutHash = hashAt < 0 ? value : value.slice(0, hashAt);
  const queryAt = withoutHash.indexOf("?");
  const rawPath = queryAt < 0 ? withoutHash : withoutHash.slice(0, queryAt);
  const rawQuery = queryAt < 0 ? "" : withoutHash.slice(queryAt + 1);
  let path: string;
  const query = new Map<string, string[]>();
  try {
    const segments = rawPath
      .slice(1)
      .split("/")
      .map((segment) => decodeURIComponent(segment));
    if (
      segments.some(
        (segment) =>
          !segment ||
          segment === "." ||
          segment === ".." ||
          /[/\\%?#]/.test(segment) ||
          unsafeCharacters.test(segment)
      )
    )
      return null;
    path = "/" + segments.join("/");
    for (const pair of rawQuery ? rawQuery.split("&") : []) {
      const equals = pair.indexOf("=");
      const key = decodeURIComponent(
        (equals < 0 ? pair : pair.slice(0, equals)).replace(/\+/g, " ")
      );
      const item = decodeURIComponent(
        (equals < 0 ? "" : pair.slice(equals + 1)).replace(/\+/g, " ")
      );
      if (/[\u0000-\u001f\u007f\\]/.test(key + item)) return null;
      query.set(key, [...(query.get(key) ?? []), item]);
    }
  } catch {
    return null;
  }
  // Ambiguous destination selectors must not choose one value arbitrarily.
  if (
    ["post", "comment", "qr"].some((key) => (query.get(key)?.length ?? 0) > 1)
  )
    return null;
  if (
    (path === "/platform" || path === "/platform/feed") &&
    query.has("post")
  ) {
    return resourceDestination(
      query.has("comment") ? "comment" : "post",
      query.get("post")![0],
      query.get("comment")?.[0]
    );
  }
  // Static routes precede dynamic slugs: /topics/following and /profile/me
  // retain their existing meaning. Profile/editProfile share one web address.
  for (const screen of Object.keys(screenPaths) as ScreenId[]) {
    const webPath = screenWebPath(screen);
    if (screen === "qr") {
      if (path === "/platform/share" && query.get("qr")?.[0] === "1")
        return { kind: "screen", screen };
    } else if (screen === "mission") {
      if (path === "/about" && hash === "our-mission")
        return { kind: "screen", screen };
    } else if (path === webPath) return { kind: "screen", screen };
  }
  // Topic creation/management have separate server routes and are reserved slugs.
  if (path === "/platform/topics/new" || path === "/platform/topics/manage")
    return null;
  const match =
    /^\/platform\/(posts|churches|events|profile|topics)\/([^/]+)$/.exec(path);
  if (!match) return null;
  const kind =
    match[1] === "posts"
      ? query.has("comment")
        ? "comment"
        : "post"
      : match[1] === "churches"
        ? "church"
        : match[1] === "events"
          ? "event"
          : match[1] === "topics"
            ? "topic"
            : "profile";
  return resourceDestination(kind, match[2], query.get("comment")?.[0]);
}
