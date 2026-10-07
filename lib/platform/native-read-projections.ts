import type { ApiPost, ApiResponse } from "./api-contracts";
import type { OriginalPostView, PostView } from "./post-reads";
import type { MemberProfileView } from "./profiles";
import type { publicChurches } from "./portal";

function postBase(view: OriginalPostView, viewerId: string | null) {
  return {
    id: view.id,
    type: view.type,
    audience: view.audience,
    author: view.author.churchId
      ? {
          kind: "church" as const,
          id: view.author.churchId,
          name: view.author.name
        }
      : {
          kind: "person" as const,
          identity: {
            id: view.author.id,
            name: view.author.name,
            username: view.author.username!
          }
        },
    body: {
      text: view.content,
      contentNote: view.contentNote,
      safeExcerpt: view.safeExcerpt,
      scripture: view.scripture,
      linkUrl: view.linkUrl,
      linkTitle: view.linkTitle,
      linkDescription: view.linkDescription
    },
    publishedAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
    editedAt: view.editedAt?.toISOString() ?? null,
    version: view.version,
    likeCount: view.likeCount,
    commentCount: view.commentCount,
    ownReaction: viewerId
      ? { liked: view.liked, version: view.likeVersion }
      : null,
    canReply: view.canReply,
    discussionClosed: view.discussionClosed,
    // Comments, resource cards and other website modules are not in this slice.
    requiresWeb: true
  };
}
export function nativePost(view: PostView, viewerId: string | null): ApiPost {
  return {
    ...postBase(view, viewerId),
    repost: view.repost
      ? {
          kind: view.repost.kind,
          source: view.repost.source
            ? postBase(view.repost.source, viewerId)
            : null
        }
      : null
  };
}
export function nativeProfile(
  view: MemberProfileView,
  viewerId: string,
  nextCursor: string | null
): ApiResponse<"profile">["data"] {
  return {
    identity: { id: view.id, name: view.name, username: view.username },
    bio: view.bio,
    location: view.location,
    website: view.website,
    interests: view.interests,
    following: view.following,
    isMe: view.isMe,
    followers: view._count.followers,
    followingCount: view._count.following,
    postCount: view.postCount,
    pinnedPost: view.pinnedPost ? nativePost(view.pinnedPost, viewerId) : null,
    posts: {
      items: view.posts.slice(0, 30).map((post) => nativePost(post, viewerId)),
      nextCursor
    },
    requiresWeb: true
  };
}
export function nativeChurch(
  view: Awaited<ReturnType<typeof publicChurches>>[number]
) {
  return {
    id: view.id,
    slug: view.slug,
    name: view.name,
    summary: view.summary,
    city: view.city,
    region: view.region,
    country: view.country,
    website: view.website,
    representativeVerified: view.representativeVerified
  };
}
