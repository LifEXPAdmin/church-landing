/** Fictional contract examples; no production identities or capability activation. */
import type { ApiOperation, ApiPost, ApiResponse } from "./api-contracts";

const person = {
  id: "fictional-member",
  name: "Example Member",
  username: "example_member"
};
export const examplePost: ApiPost = {
  id: "fictional-post",
  type: "PRAYER",
  audience: "PUBLIC",
  author: { kind: "person", identity: person },
  body: {
    text: "Please pray for our community.",
    contentNote: null,
    safeExcerpt: null,
    scripture: null,
    linkUrl: null,
    linkTitle: null,
    linkDescription: null
  },
  publishedAt: "2026-10-07T00:00:00.000Z",
  updatedAt: "2026-10-07T00:00:00.000Z",
  editedAt: null,
  version: 1,
  likeCount: null,
  commentCount: 0,
  ownReaction: { liked: true, version: 2 },
  canReply: true,
  discussionClosed: false,
  requiresWeb: true,
  repost: null
};
const church = {
  id: "fictional-church",
  slug: "example-church",
  name: "Example Church",
  summary: "A fictional fixture.",
  city: "",
  region: "",
  country: "",
  website: null,
  representativeVerified: false
};
const member = <T,>(data: T) => ({
  apiVersion: "1" as const,
  viewerId: person.id,
  data
});
const guest = <T,>(data: T) => ({
  apiVersion: "1" as const,
  viewerId: null,
  data
});
export const apiResponseExamples = {
  capabilities: guest({
    supportedVersions: ["1"],
    features: [{ name: "session.read", available: false }]
  }),
  session: member({ state: "authenticated", account: person }),
  feed: member({
    mode: "latest",
    scope: "opaque-scope",
    pageCursor: "opaque.page.signature",
    page: { items: [examplePost], nextCursor: null },
    notice: null
  }),
  post: member(examplePost),
  profile: member({
    identity: person,
    bio: "",
    location: null,
    website: null,
    interests: [],
    following: false,
    isMe: true,
    followers: null,
    followingCount: null,
    postCount: 1,
    pinnedPost: null,
    posts: { items: [examplePost], nextCursor: null },
    requiresWeb: true
  }),
  churches: guest({ items: [church], nextCursor: null }),
  church: guest({
    church,
    meetingInfo: "",
    serviceTimes: "",
    accessibilityInfo: "",
    connectionsAvailable: false,
    pinnedPosts: [],
    requiresWeb: true,
    posts: { items: [], nextCursor: null }
  }),
  like: member({ id: examplePost.id, liked: true, version: 2, count: null }),
  setLike: member({ id: examplePost.id, version: 2, message: "Post liked." }),
  reactionPreferences: member({
    ownerId: person.id,
    hideAuthoredReactionCounts: true,
    version: 4,
    recoveryRequired: false
  }),
  setReactionPreferences: member({
    id: person.id,
    version: 4,
    message: "Your reaction-count choice is saved."
  })
} satisfies { [K in ApiOperation]: ApiResponse<K> };

export const apiWriteExamples = {
  setLike: {
    mutationId: "fictional-like-1",
    expectedVersion: 1,
    desired: true
  },
  setReactionPreferences: {
    mutationId: "fictional-choice-1",
    expectedVersion: 3,
    hideAuthoredReactionCounts: true
  }
};
