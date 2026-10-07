import { postPreviewText, type ApiPost } from "@godschurches/shared-core";

export type PresentedPost = Omit<ApiPost, "repost">;

/** Presentation only. These projections never grant access or retain a post. */
export function postParts(post: ApiPost, detail = false, revealed = false) {
  const concealedQuote = post.repost?.kind === "QUOTE" && post.body.contentNote !== null && (!detail || !revealed);
  return {
    primary: post.repost?.kind === "PLAIN" ? post.repost.source : post,
    quoted: post.repost?.kind === "QUOTE" && !concealedQuote ? post.repost.source : null,
    missingSource: post.repost !== null && post.repost.source === null && !concealedQuote,
    reposter: post.repost?.kind === "PLAIN" ? authorLabel(post.author) : null
  };
}

export function authorLabel(author: ApiPost["author"]) {
  return author.kind === "church" ? author.name : author.identity.name;
}

export function postBodyPresentation(post: PresentedPost, detail: boolean, revealed: boolean) {
  const full = detail && (post.body.contentNote === null || revealed);
  return {
    full,
    text: full ? post.body.text : postPreviewText({ content: post.body.text,
      contentNote: post.body.contentNote, safeExcerpt: post.body.safeExcerpt }),
    contentNote: post.body.contentNote,
    // A content note protects the whole body, including scripture and links.
    scripture: full ? post.body.scripture : null,
    link: full && post.body.linkUrl ? { url: post.body.linkUrl,
      title: post.body.linkTitle, description: post.body.linkDescription } : null
  };
}

export function postMeta(post: PresentedPost) {
  return {
    audience: { PUBLIC: "Public", CHURCH: "Church", GROUP: "Group" }[post.audience],
    type: { TESTIMONY: "Testimony", PRAYER: "Prayer", TEACHING: "Teaching", UPDATE: "Update", NEED: "Need" }[post.type],
    likes: post.likeCount === null ? "Like count hidden" : `${post.likeCount} ${post.likeCount === 1 ? "like" : "likes"}`,
    comments: `${post.commentCount} ${post.commentCount === 1 ? "comment" : "comments"}`,
    discussion: post.discussionClosed ? "Discussion closed" : !post.canReply ? "Replies unavailable" : null
  };
}
