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
  setCommentLike: member({
    id: "fictional-comment",
    version: 1,
    message: "Comment liked."
  }),
  comments: guest({
    postId: "fictional-post",
    sort: "oldest",
    items: [
      {
        id: "fictional-comment",
        rootId: null,
        parentId: null,
        createdAt: "2026-10-07T00:00:00.000Z",
        replyCount: 1,
        available: false
      }
    ],
    nextCursor: null,
    root: null,
    target: null,
    pinned: null,
    pinVersion: 0,
    canPin: false,
    canReply: false,
    discussionClosed: false,
    visibleCount: 1,
    conversation: { mode: "DEFAULT", version: 0 },
    requiresWeb: true
  }),
  bookmarks: member({
    items: [
      {
        id: "fictional-bookmark",
        version: 1,
        collectionId: null,
        available: false
      }
    ],
    nextCursor: null
  }),
  bookmarkCollections: member({
    items: [
      {
        id: "fictional-collection",
        name: "Private reading",
        version: 1,
        createdAt: "2026-10-07T00:00:00.000Z",
        updatedAt: "2026-10-07T00:00:00.000Z"
      }
    ],
    nextCursor: null
  }),
  bookmarkStatus: member({
    item: { id: "fictional-bookmark", version: 1, collectionId: null }
  }),
  bookmarkCommand: member({
    id: "fictional-bookmark",
    version: 1,
    message: "Post saved privately."
  }),
  bookmarkCollectionCommand: member({
    id: "fictional-collection",
    version: 1,
    message: "Private collection saved."
  }),
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
  setCommentLike: {
    mutationId: "fictional-comment-like-1",
    expectedVersion: 0,
    desired: true
  },
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
