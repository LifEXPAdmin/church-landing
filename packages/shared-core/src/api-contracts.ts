/**
 * Versioned v1 wire contracts, independent of HTTP activation and authorization.
 * No browser, framework, database, credential or server runtime imports.
 * Services must authorize and explicitly project before encode; never pass rows.
 */
import { POST_TOPICS, POST_TYPES } from "./post-options";

export const API_VERSION = "1" as const;
export const API_BASE_PATH = "/api/platform/v1" as const;
export const API_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const API_MAX_REQUEST_BYTES = 16 * 1024;

type UnknownFields = "reject" | "strip";
export type WireSchema<T> = {
  readonly parse: (value: unknown, unknownFields?: UnknownFields) => T;
};
export type WireValue<S> = S extends WireSchema<infer T> ? T : never;
export class WireContractError extends Error {
  constructor() {
    // Do not put the rejected payload, tokens or private fields in diagnostics.
    super("The response or request does not match the API contract.");
    this.name = "WireContractError";
  }
}
const fail = (): never => {
  throw new WireContractError();
};
const schema = <T,>(parse: WireSchema<T>["parse"]): WireSchema<T> =>
  Object.freeze({ parse });
const text = (max: number, min = 0, pattern?: RegExp) =>
  schema<string>((value) =>
    typeof value === "string" &&
    value.length >= min &&
    value.length <= max &&
    (!pattern || pattern.test(value))
      ? value
      : fail()
  );
const integer = (max = Number.MAX_SAFE_INTEGER) =>
  schema<number>((value) =>
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= max
      ? value
      : fail()
  );
const boolean = schema<boolean>((value) =>
  typeof value === "boolean" ? value : fail()
);
const literal = <const T extends string | boolean>(expected: T) =>
  schema<T>((value) => (value === expected ? expected : fail()));
const oneOf = <const T extends readonly string[]>(choices: T) =>
  schema<T[number]>((value) =>
    typeof value === "string" && choices.includes(value)
      ? (value as T[number])
      : fail()
  );
const nullable = <T,>(child: WireSchema<T>) =>
  schema<T | null>((value, mode) =>
    value === null ? null : child.parse(value, mode)
  );
const array = <T,>(child: WireSchema<T>, max: number) =>
  schema<T[]>((value, mode) =>
    Array.isArray(value) && value.length <= max
      ? Array.from(value, (entry) => child.parse(entry, mode))
      : fail()
  );
const object = <const S extends Record<string, WireSchema<unknown>>>(
  shape: S
) =>
  schema<{ [K in keyof S]: WireValue<S[K]> }>((value, mode = "reject") => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return fail();
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return fail();
    const row = value as Record<string, unknown>;
    if (
      mode === "reject" &&
      Object.keys(row).some((key) => !Object.hasOwn(shape, key))
    )
      return fail();
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(shape)) {
      if (!Object.hasOwn(row, key)) return fail();
      result[key] = shape[key].parse(row[key], mode);
    }
    return result as { [K in keyof S]: WireValue<S[K]> };
  });
const union = <A, B>(a: WireSchema<A>, b: WireSchema<B>) =>
  schema<A | B>((value, mode) => {
    try {
      return a.parse(value, mode);
    } catch (error) {
      if (!(error instanceof WireContractError)) throw error;
    }
    return b.parse(value, mode);
  });

// Shared, runtime-independent building blocks for additional versioned slices.
export const wire = Object.freeze({
  schema,
  text,
  integer,
  boolean,
  literal,
  oneOf,
  nullable,
  array,
  object,
  union
});

export const apiId = text(100, 1, /^[A-Za-z0-9_-]+$/);
export const apiUsername = text(24, 3, /^[A-Za-z0-9_]+$/);
export const apiCursor = text(4096, 1, /^[A-Za-z0-9_.-]+$/);
export const apiDate = schema<string>((value) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  )
    return fail();
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value
    ? value
    : fail();
});
const version = integer(Number.MAX_SAFE_INTEGER - 1);
const mutationId = text(80, 1, /^[A-Za-z0-9_-]+$/);
const identity = object({
  id: apiId,
  name: text(120, 1),
  username: apiUsername
});
export const apiAuthor = union(
  object({ kind: literal("person"), identity }),
  object({ kind: literal("church"), id: apiId, name: text(200, 1) })
);

const postBody = object({
  text: text(3000),
  contentNote: nullable(text(120, 1)),
  safeExcerpt: nullable(text(160, 1)),
  scripture: nullable(text(120, 1)),
  linkUrl: nullable(text(2048, 1)),
  linkTitle: nullable(text(300)),
  linkDescription: nullable(text(1000))
});
const postBase = {
  id: apiId,
  type: oneOf(["TESTIMONY", "PRAYER", "TEACHING", "UPDATE", "NEED"]),
  audience: oneOf(["PUBLIC", "CHURCH", "GROUP"]),
  author: apiAuthor,
  body: postBody,
  publishedAt: apiDate,
  updatedAt: apiDate,
  editedAt: nullable(apiDate),
  version,
  likeCount: nullable(integer()),
  commentCount: integer(),
  ownReaction: nullable(object({ liked: boolean, version })),
  canReply: boolean,
  discussionClosed: boolean,
  // The initial native contract does not flatten unsupported media/resource UI.
  // A server adapter sets this when the complete interaction needs the website.
  requiresWeb: boolean
};
export const apiPost = object({
  ...postBase,
  repost: nullable(
    object({
      kind: oneOf(["PLAIN", "QUOTE"]),
      source: nullable(object(postBase))
    })
  )
});
export type ApiPost = WireValue<typeof apiPost>;
const page = <T,>(item: WireSchema<T>, max: number) =>
  object({
    items: array(item, max),
    nextCursor: nullable(apiCursor)
  });
const feedMode = oneOf([
  "latest",
  "friends",
  "weekly",
  "trending",
  "for-you",
  "following",
  "your-church",
  "churches",
  "local",
  "public",
  "favorites"
]);
export const apiFeed = object({
  mode: feedMode,
  scope: text(100, 1),
  pageCursor: apiCursor,
  page: page(apiPost, 30),
  notice: nullable(text(1000))
});
export const apiProfile = object({
  identity,
  bio: nullable(text(3000)),
  location: nullable(text(300)),
  website: nullable(text(2048)),
  interests: array(text(100, 1), 30),
  following: boolean,
  isMe: boolean,
  followers: nullable(integer()),
  followingCount: nullable(integer()),
  postCount: integer(),
  pinnedPost: nullable(apiPost),
  posts: page(apiPost, 30),
  requiresWeb: boolean
});
export const apiChurch = object({
  id: apiId,
  slug: text(200, 1),
  name: text(200, 1),
  summary: text(3000),
  city: text(200),
  region: text(200),
  country: text(200),
  website: nullable(text(2048)),
  representativeVerified: boolean
});
export const apiChurchDetail = object({
  church: apiChurch,
  meetingInfo: text(5000),
  serviceTimes: text(3000),
  accessibilityInfo: text(3000),
  connectionsAvailable: boolean,
  pinnedPosts: array(apiPost, 3),
  requiresWeb: boolean,
  posts: page(apiPost, 30)
});
export const apiSession = union(
  object({
    state: literal("guest"),
    account: schema<null>((v) => (v === null ? null : fail()))
  }),
  object({ state: literal("authenticated"), account: identity })
);
export const apiReactionPreferences = object({
  ownerId: apiId,
  hideAuthoredReactionCounts: boolean,
  version,
  recoveryRequired: boolean
});
export const apiLikeState = object({
  id: apiId,
  liked: boolean,
  version,
  count: nullable(integer())
});
const commentStructure = {
  id: apiId,
  rootId: nullable(apiId),
  parentId: nullable(apiId),
  createdAt: apiDate,
  replyCount: integer()
};
// A retained parent is structural context only. Hidden names, text, versions,
// mentions and reactions are absent rather than a second content projection.
export const apiComment = union(
  object({ ...commentStructure, available: literal(false) }),
  union(
    object({
      ...commentStructure,
      available: literal(true),
      requiresWeb: literal(true)
    }),
    object({
      ...commentStructure,
      available: literal(true),
      requiresWeb: literal(false),
      content: text(1500),
      author: apiAuthor,
      version,
      editedAt: nullable(apiDate),
      prayerUpdateKind: nullable(text(40, 1)),
      isPostAuthor: boolean,
      replyTo: nullable(object({ id: apiId, name: nullable(text(200, 1)) })),
      mentions: array(identity, 5),
      likeCount: nullable(integer()),
      ownReaction: nullable(object({ liked: boolean, version })),
      canReply: boolean,
      canEdit: boolean,
      canDelete: boolean
    })
  )
);
export type ApiComment = WireValue<typeof apiComment>;
const commentQueryShape = object({
  view: oneOf(["roots", "replies", "context"]),
  sort: oneOf(["oldest", "newest"]),
  rootId: nullable(apiId),
  commentId: nullable(apiId),
  cursor: nullable(apiCursor)
});
const commentQuery = schema<WireValue<typeof commentQueryShape>>((v, mode) => {
  const query = commentQueryShape.parse(v, mode);
  if (
    (query.view === "roots" &&
      (query.rootId !== null || query.commentId !== null)) ||
    (query.view === "replies" &&
      (query.rootId === null || query.commentId !== null)) ||
    (query.view === "context" &&
      (query.rootId !== null || query.commentId === null)) ||
    (query.view !== "roots" && query.sort !== "oldest")
  )
    return fail();
  return query;
});
export const apiCommentThread = object({
  postId: apiId,
  sort: oneOf(["oldest", "newest"]),
  items: array(apiComment, 20),
  nextCursor: nullable(apiCursor),
  root: nullable(apiComment),
  target: nullable(apiComment),
  pinned: nullable(apiComment),
  pinVersion: version,
  canPin: boolean,
  canReply: boolean,
  discussionClosed: boolean,
  visibleCount: integer(),
  conversation: object({ mode: oneOf(["DEFAULT", "FOLLOW", "MUTE"]), version }),
  // Writing, prayer, mentions and group read acknowledgements use the website
  // until their native operations and consumers have separate acceptance.
  requiresWeb: literal(true)
});
// A historical receipt does not assert that a current read/permission still succeeds.
export const apiMutationReceipt = object({
  id: apiId,
  version,
  message: text(1000)
});

const bookmarkKey = text(80, 1, /^[A-Za-z0-9_-]+$/);
const bookmarkFields = {
  id: bookmarkKey,
  version,
  collectionId: nullable(bookmarkKey)
};
const resourceCard = object({
  kind: oneOf([
    "exchangeListing",
    "eventOccurrence",
    "volunteerOpportunity",
    "mediaCatalogItem"
  ]),
  id: apiId,
  title: text(300),
  href: text(240, 1),
  state: text(100, 1),
  requiresWeb: literal(true),
  event: nullable(
    object({
      startAt: apiDate,
      endAt: apiDate,
      timeZone: text(100, 1),
      allDay: boolean,
      startLocal: text(32, 1),
      endLocal: text(32, 1)
    })
  )
});
const bookmarkResource = schema<WireValue<typeof resourceCard>>((v, mode) => {
  const card = resourceCard.parse(v, mode);
  const paths = {
    exchangeListing: ["/platform/exchange/", "/platform/exchange/help/"],
    eventOccurrence: ["/platform/events/"],
    volunteerOpportunity: ["/platform/serve/"],
    mediaCatalogItem: ["/platform/media/"]
  };
  if (
    !paths[card.kind].some((path) => card.href === path + card.id) ||
    (card.kind === "eventOccurrence") !== (card.event !== null)
  )
    return fail();
  return card;
});
const bookmarkPostShape = object({
  id: apiId,
  excerpt: text(300),
  contentNote: nullable(text(120, 1)),
  type: oneOf(["TESTIMONY", "PRAYER", "TEACHING", "UPDATE", "NEED"]),
  publishedAt: nullable(apiDate),
  href: text(240, 1)
});
const bookmarkPost = schema<WireValue<typeof bookmarkPostShape>>((v, mode) => {
  const post = bookmarkPostShape.parse(v, mode);
  return post.href === "/platform/posts/" + post.id ? post : fail();
});
// Unavailable saved items expose only the owner's bookmark, never its source.
export const apiBookmark = union(
  object({ ...bookmarkFields, available: literal(false) }),
  union(
    object({
      ...bookmarkFields,
      available: literal(true),
      post: bookmarkPost
    }),
    object({
      ...bookmarkFields,
      available: literal(true),
      resource: bookmarkResource
    })
  )
);
const bookmarkCollection = object({
  id: bookmarkKey,
  name: text(80, 1),
  version,
  createdAt: apiDate,
  updatedAt: apiDate
});
const namedBookmarkCollectionShape = object({
  operation: oneOf(["create-collection", "rename-collection"]),
  mutationId,
  id: bookmarkKey,
  expectedVersion: version,
  name: text(80, 1)
});
const namedBookmarkCollection = schema<
  WireValue<typeof namedBookmarkCollectionShape>
>((value, mode) => {
  const command = namedBookmarkCollectionShape.parse(value, mode);
  // The canonical reader reserves this ID for items outside any collection.
  // Existing references still support rename/delete so they can be cleaned up.
  return command.operation === "create-collection" && command.id === "unfiled"
    ? fail()
    : command;
});

// Unknown future names can be ignored by old clients. They never grant authority.
const capability = text(80, 1, /^[a-z][A-Za-z0-9.]*$/);
export const apiCapabilities = object({
  supportedVersions: array(text(8, 1, /^[1-9][0-9]*$/), 8),
  features: array(object({ name: capability, available: boolean }), 64)
});

export const apiErrorRules = Object.freeze({
  validation: { status: 400, action: "correct_request" },
  unauthenticated: { status: 401, action: "sign_in" },
  account_changed: { status: 401, action: "return_to_account" },
  forbidden: { status: 403, action: "none" },
  authenticator_required: { status: 403, action: "verify_authenticator" },
  not_found: { status: 404, action: "none" },
  method_not_allowed: { status: 405, action: "correct_request" },
  conflict: { status: 409, action: "refresh" },
  cursor_invalid: { status: 409, action: "refresh" },
  recovery_required: { status: 409, action: "review" },
  unsupported_version: { status: 426, action: "update" },
  rate_limited: { status: 429, action: "wait" },
  feature_unavailable: { status: 503, action: "none" },
  unconfirmed: { status: 503, action: "reconcile" }
} as const);
for (const rule of Object.values(apiErrorRules)) Object.freeze(rule);
export type ApiErrorCode = keyof typeof apiErrorRules;
export type ApiFailure = {
  apiVersion: typeof API_VERSION;
  error: {
    code: ApiErrorCode;
    message: string;
    retryAfterSeconds: number | null;
  };
};
export const apiFailure = schema<ApiFailure>((value, mode) => {
  const result = object({
    apiVersion: literal(API_VERSION),
    error: object({
      code: text(50, 1),
      message: text(1000, 1),
      retryAfterSeconds: nullable(integer(86400))
    })
  }).parse(value, mode);
  if (!Object.hasOwn(apiErrorRules, result.error.code)) return fail();
  if (
    result.error.retryAfterSeconds !== null &&
    result.error.code !== "rate_limited" &&
    result.error.code !== "unconfirmed"
  )
    return fail();
  return result as ApiFailure;
});

const envelope = <T,>(data: WireSchema<T>) =>
  object({
    apiVersion: literal(API_VERSION),
    viewerId: nullable(apiId),
    data
  });
const empty = object({});
const endpoint = <Q, B, R>(
  method: "GET" | "POST",
  path: string,
  query: WireSchema<Q>,
  body: WireSchema<B>,
  response: WireSchema<R>,
  access: "public" | "member" | "discovery"
) =>
  Object.freeze({
    method,
    path: API_BASE_PATH + path,
    params: path.includes(":commentId")
      ? object({ postId: apiId, commentId: apiId })
      : path.includes(":postId")
        ? object({ postId: apiId })
        : path.includes(":churchId")
          ? object({ churchId: apiId })
          : path.includes(":username")
            ? object({ username: apiUsername })
            : empty,
    query,
    body,
    response: envelope(response),
    access,
    state: "contract-only" as const
  });

export const apiContracts = Object.freeze({
  createPost: endpoint(
    "POST",
    "/posts",
    empty,
    object({
      // Direct publication keeps the canonical requestKey receipt owner.
      requestKey: apiId,
      // Keep raw text in the fingerprint; canonical validation normalizes CRLF.
      content: text(6000, 3),
      contentNote: text(240),
      safeExcerpt: text(320),
      scripture: text(240),
      type: oneOf(POST_TYPES),
      topics: array(oneOf(POST_TOPICS), 5),
      authorChurchId: nullable(apiId),
      audienceChurchId: nullable(apiId),
      audience: oneOf(["PUBLIC", "CHURCH"]),
      replyAudience: oneOf(["VIEWERS", "CHURCH_MEMBERS"]),
      allowReposts: boolean
    }),
    apiMutationReceipt,
    "member"
  ),
  createComment: endpoint(
    "POST",
    "/posts/:postId/comments",
    empty,
    object({
      mutationId,
      // Preserve raw CRLF bytes for the canonical fingerprint. The service
      // normalizes line endings before its existing 1,500-character limit.
      content: text(3000, 2),
      replyToId: nullable(apiId),
      authorChurchId: nullable(apiId),
      mentionIds: array(apiId, 5)
    }),
    apiMutationReceipt,
    "member"
  ),
  editComment: endpoint(
    "POST",
    "/posts/:postId/comments/:commentId",
    empty,
    object({
      mutationId,
      expectedVersion: version,
      // Preserve raw text for the existing receipt; canonical validation owns
      // normalization, the 1,500-character limit and mention eligibility.
      content: text(3000, 2),
      mentionIds: array(apiId, 5)
    }),
    apiMutationReceipt,
    "member"
  ),
  setCommentLike: endpoint(
    "POST",
    "/posts/:postId/comments/:commentId/like",
    empty,
    object({ mutationId, expectedVersion: version, desired: boolean }),
    apiMutationReceipt,
    "member"
  ),
  comments: endpoint(
    "GET",
    "/posts/:postId/comments",
    commentQuery,
    empty,
    apiCommentThread,
    "public"
  ),
  bookmarks: endpoint(
    "GET",
    "/bookmarks",
    object({
      cursor: nullable(apiCursor),
      collectionId: nullable(bookmarkKey)
    }),
    empty,
    page(apiBookmark, 20),
    "member"
  ),
  bookmarkCollections: endpoint(
    "GET",
    "/bookmark-collections",
    object({ cursor: nullable(apiCursor) }),
    empty,
    page(bookmarkCollection, 20),
    "member"
  ),
  bookmarkStatus: endpoint(
    "GET",
    "/posts/:postId/bookmark",
    empty,
    empty,
    object({ item: nullable(object(bookmarkFields)) }),
    "member"
  ),
  bookmarkCommand: endpoint(
    "POST",
    "/bookmarks",
    empty,
    union(
      object({
        operation: literal("save-item"),
        mutationId,
        expectedVersion: version,
        postId: apiId,
        collectionId: nullable(bookmarkKey)
      }),
      union(
        object({
          operation: literal("move-item"),
          mutationId,
          expectedVersion: version,
          id: bookmarkKey,
          collectionId: nullable(bookmarkKey)
        }),
        object({
          operation: literal("remove-item"),
          mutationId,
          expectedVersion: version,
          id: bookmarkKey
        })
      )
    ),
    apiMutationReceipt,
    "member"
  ),
  bookmarkCollectionCommand: endpoint(
    "POST",
    "/bookmark-collections",
    empty,
    union(
      namedBookmarkCollection,
      object({
        operation: literal("delete-collection"),
        mutationId,
        id: bookmarkKey,
        expectedVersion: version
      })
    ),
    apiMutationReceipt,
    "member"
  ),
  capabilities: endpoint(
    "GET",
    "/capabilities",
    empty,
    empty,
    apiCapabilities,
    "public"
  ),
  session: endpoint("GET", "/session", empty, empty, apiSession, "discovery"),
  feed: endpoint(
    "GET",
    "/feed",
    object({
      mode: feedMode,
      cursor: nullable(apiCursor),
      scope: nullable(text(100, 1))
    }),
    empty,
    apiFeed,
    "public"
  ),
  post: endpoint("GET", "/posts/:postId", empty, empty, apiPost, "public"),
  profile: endpoint(
    "GET",
    "/profiles/:username",
    object({ cursor: nullable(apiCursor) }),
    empty,
    apiProfile,
    "member"
  ),
  churches: endpoint(
    "GET",
    "/churches",
    object({ query: text(100), cursor: nullable(apiCursor) }),
    empty,
    page(apiChurch, 100),
    "public"
  ),
  church: endpoint(
    "GET",
    "/churches/:churchId",
    object({ cursor: nullable(apiCursor) }),
    empty,
    apiChurchDetail,
    "public"
  ),
  like: endpoint(
    "GET",
    "/posts/:postId/like",
    empty,
    empty,
    apiLikeState,
    "public"
  ),
  setLike: endpoint(
    "POST",
    "/posts/:postId/like",
    empty,
    object({ mutationId, expectedVersion: version, desired: boolean }),
    apiMutationReceipt,
    "member"
  ),
  reactionPreferences: endpoint(
    "GET",
    "/reaction-preferences",
    empty,
    empty,
    apiReactionPreferences,
    "member"
  ),
  setReactionPreferences: endpoint(
    "POST",
    "/reaction-preferences",
    empty,
    object({
      mutationId,
      expectedVersion: version,
      hideAuthoredReactionCounts: boolean
    }),
    apiMutationReceipt,
    "member"
  )
});
export type ApiOperation = keyof typeof apiContracts;
export type ApiResponse<K extends ApiOperation> = WireValue<
  (typeof apiContracts)[K]["response"]
>;

/** Strict outbound allowlist; rejects accidental row spreads or secret fields. */
export function encodeApiResponse<K extends ApiOperation>(
  operation: K,
  value: unknown
): ApiResponse<K> {
  const result = apiContracts[operation].response.parse(
    value,
    "reject"
  ) as ApiResponse<K>;
  return bindApiResponse(operation, result, result.viewerId);
}
/** Consumers discard additive unknown fields and reject malformed required fields. */
export function decodeApiResponse<K extends ApiOperation>(
  operation: K,
  value: unknown,
  expectedViewer: string | null
): ApiResponse<K> {
  const result = apiContracts[operation].response.parse(
    value,
    "strip"
  ) as ApiResponse<K>;
  return bindApiResponse(operation, result, expectedViewer);
}
/** Initial identity discovery only; never rebind an existing draft from this result. */
export function decodeApiSession(value: unknown): ApiResponse<"session"> {
  const result = apiContracts.session.response.parse(value, "strip");
  return bindApiResponse("session", result, result.viewerId);
}
function bindApiResponse<K extends ApiOperation>(
  operation: K,
  result: ApiResponse<K>,
  expectedViewer: string | null
): ApiResponse<K> {
  if (result.viewerId !== expectedViewer) return fail();
  if (apiContracts[operation].access === "member" && !result.viewerId)
    return fail();
  if (
    operation === "reactionPreferences" &&
    (result as ApiResponse<"reactionPreferences">).data.ownerId !==
      result.viewerId
  )
    return fail();
  if (
    operation === "setReactionPreferences" &&
    (result as ApiResponse<"setReactionPreferences">).data.id !==
      result.viewerId
  )
    return fail();
  if (operation === "session") {
    const session = (result as ApiResponse<"session">).data;
    if (
      (session.state === "guest" ? null : session.account.id) !==
      result.viewerId
    )
      return fail();
  }
  if (result.viewerId === null) {
    const guestPost = (post: ApiPost) => {
      if (post.ownReaction !== null || post.repost?.source?.ownReaction) fail();
    };
    if (operation === "post") guestPost((result as ApiResponse<"post">).data);
    if (operation === "feed")
      (result as ApiResponse<"feed">).data.page.items.forEach(guestPost);
    if (operation === "church")
      [
        ...(result as ApiResponse<"church">).data.posts.items,
        ...(result as ApiResponse<"church">).data.pinnedPosts
      ].forEach(guestPost);
    if (operation === "like") {
      const state = (result as ApiResponse<"like">).data;
      if (state.liked || state.version !== 0) fail();
    }
    if (operation === "comments") {
      const thread = (result as ApiResponse<"comments">).data;
      for (const comment of [
        ...thread.items,
        thread.root,
        thread.target,
        thread.pinned
      ])
        if (
          comment?.available &&
          !comment.requiresWeb &&
          (comment.ownReaction !== null ||
            comment.canReply ||
            comment.canEdit ||
            comment.canDelete)
        )
          fail();
      if (
        thread.canPin ||
        thread.canReply ||
        thread.conversation.mode !== "DEFAULT" ||
        thread.conversation.version !== 0
      )
        fail();
    }
  }
  return result;
}
