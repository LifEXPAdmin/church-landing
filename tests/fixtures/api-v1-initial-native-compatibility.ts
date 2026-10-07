/**
 * Initial native v1 consumer/request shapes from reviewed contract 64e2106.
 * Historical e02ab5d evidence is retained separately; this is a preactivation
 * baseline reconciliation, not a claim of compatibility with that decoder.
 * This is compatibility evidence, not another implementation or schema owner.
 * Do not regenerate it to silence a breaking change. Version changes require
 * the documented server/client migration policy and an explicit reviewed baseline.
 */
import type {
  ApiResponse,
  ApiFailure,
  apiContracts,
  WireValue
} from "../../lib/platform/api-contracts";

type Identity = { id: string; name: string; username: string };
type Author =
  | { kind: "person"; identity: Identity }
  | { kind: "church"; id: string; name: string };
type PostBase = {
  id: string;
  type: "TESTIMONY" | "PRAYER" | "TEACHING" | "UPDATE" | "NEED";
  audience: "PUBLIC" | "CHURCH" | "GROUP";
  author: Author;
  body: {
    text: string;
    contentNote: string | null;
    safeExcerpt: string | null;
    scripture: string | null;
    linkUrl: string | null;
    linkTitle: string | null;
    linkDescription: string | null;
  };
  publishedAt: string;
  updatedAt: string;
  editedAt: string | null;
  version: number;
  likeCount: number | null;
  commentCount: number;
  ownReaction: { liked: boolean; version: number } | null;
  canReply: boolean;
  discussionClosed: boolean;
  requiresWeb: boolean;
};
type Post = PostBase & { repost: { kind: "PLAIN" | "QUOTE"; source: PostBase | null } | null };
type Page<T> = { items: T[]; nextCursor: string | null };
type Envelope<T> = { apiVersion: "1"; viewerId: string | null; data: T };
type FeedMode = "latest" | "friends" | "weekly" | "trending" | "for-you" | "following" | "your-church" | "churches" | "local" | "public" | "favorites";
type Church = { id: string; slug: string; name: string; summary: string; city: string; region: string; country: string; website: string | null; representativeVerified: boolean };
type Receipt = { id: string; version: number; message: string };
type Responses = {
  capabilities: Envelope<{ supportedVersions: string[]; features: { name: string; available: boolean }[] }>;
  session: Envelope<{ state: "guest"; account: null } | { state: "authenticated"; account: Identity }>;
  feed: Envelope<{ mode: FeedMode; scope: string; pageCursor: string; page: Page<Post>; notice: string | null }>;
  post: Envelope<Post>;
  profile: Envelope<{ identity: Identity; bio: string | null; location: string | null; website: string | null; interests: string[]; following: boolean; isMe: boolean; followers: number | null; followingCount: number | null; postCount: number; pinnedPost: Post | null; posts: Page<Post>; requiresWeb: boolean }>;
  churches: Envelope<Page<Church>>;
  church: Envelope<{ church: Church; meetingInfo: string; serviceTimes: string; accessibilityInfo: string; connectionsAvailable: boolean; pinnedPosts: Post[]; requiresWeb: boolean; posts: Page<Post> }>;
  like: Envelope<{ id: string; liked: boolean; version: number; count: number | null }>;
  setLike: Envelope<Receipt>;
  reactionPreferences: Envelope<{ ownerId: string; hideAuthoredReactionCounts: boolean; version: number; recoveryRequired: boolean }>;
  setReactionPreferences: Envelope<Receipt>;
};
type Empty = Record<string, never>;
type Request<P = Empty, Q = Empty, B = Empty> = { params: P; query: Q; body: B };
type Requests = {
  capabilities: Request;
  session: Request;
  feed: Request<Empty, { mode: FeedMode; cursor: string | null; scope: string | null }>;
  post: Request<{ postId: string }>;
  profile: Request<{ username: string }, { cursor: string | null }>;
  churches: Request<Empty, { query: string; cursor: string | null }>;
  church: Request<{ churchId: string }, { cursor: string | null }>;
  like: Request<{ postId: string }>;
  setLike: Request<{ postId: string }, Empty, { mutationId: string; expectedVersion: number; desired: boolean }>;
  reactionPreferences: Request;
  setReactionPreferences: Request<Empty, Empty, { mutationId: string; expectedVersion: number; hideAuthoredReactionCounts: boolean }>;
};
type Failure = { apiVersion: "1"; error: {
  code: "validation" | "unauthenticated" | "account_changed" | "forbidden" | "authenticator_required" | "not_found" | "method_not_allowed" | "conflict" | "cursor_invalid" | "recovery_required" | "unsupported_version" | "rate_limited" | "feature_unavailable" | "unconfirmed";
  message: string;
  retryAfterSeconds: number | null;
} };
type Operation = keyof Responses;
type ResponseMatches = { [K in Operation]: ApiResponse<K> extends Responses[K] ? true : false };
type RequestMatches = { [K in Operation]: Requests[K] extends {
  params: WireValue<(typeof apiContracts)[K]["params"]>;
  query: WireValue<(typeof apiContracts)[K]["query"]>;
  body: WireValue<(typeof apiContracts)[K]["body"]>;
} ? true : false };
type AllTrue<T> = Exclude<T, true> extends never ? true : false;
type Assert<T extends true> = T;

// Current responses must remain readable by the old consumer. Additional fields
// are allowed. Old requests must still be accepted by the current server.
export type InitialNativeV1Compatibility = [
  Assert<AllTrue<ResponseMatches[Operation]>>,
  Assert<AllTrue<RequestMatches[Operation]>>,
  Assert<ApiFailure extends Failure ? true : false>
];
