import { AuthorAvatar } from "./author-avatar";
import { PostPhotos } from "./post-photos";
import { PublicShareControls } from "./public-share-controls";
import { SavePostControl } from "./save-post-control";
import { PostMoreMenu } from "./post-more-menu";
import { CommentSheet } from "./comment-sheet";
import { CommentThread } from "./comment-thread";
import type { PostView } from "@/lib/platform/post-reads";
import { PostLink } from "./post-link";
import { PostActionPending } from "./post-action-pending";
import { accountEntryHref } from "@/lib/platform/account-entry";
import Link from "next/link";
import { Heart, Globe, MessageCircle } from "lucide-react";
import { togglePlatformPostLike } from "@/app/platform/actions";
import { formatDate, postTypeLabels } from "@/lib/platform/format";
import { PostParticipation } from "./post-participation";
import { PostText } from "./post-text";

interface PostCardProps {
  post: PostView;
  currentUserId?: string;
  redirectTo?: string;
  fullDiscussion?: boolean;
  moreCommentsHref?: string;
  commentId?: string;
}
export function PostCard({
  post,
  currentUserId,
  redirectTo = "/platform",
  fullDiscussion = false,
  commentId
}: PostCardProps) {
  const liked = post.liked;
  const count = post.commentCount;
  return (
    <article className="gc-post" aria-label={`Post by ${post.author.name}`}>
      <header className="gc-post-header">
        <Link
          href={
            post.author.churchId
              ? `/platform/churches/${post.author.churchId}`
              : `/platform/profile/${post.author.username}`
          }
          className="gc-post-author"
        >
          <AuthorAvatar
            id={post.author.id}
            name={post.author.name}
            owner={post.author.churchId ? null : currentUserId}
          />
          <span>
            <strong>{post.author.name}</strong>
            <span className="gc-post-handle">
              {post.author.churchId ? "Church" : `@${post.author.username}`}
            </span>
          </span>
        </Link>
        <PostMoreMenu
          postId={post.id}
          name={post.author.name}
          kind={post.author.churchId ? "church" : "person"}
          targetId={post.author.churchId ?? post.author.id}
          own={currentUserId === post.author.id}
          canEdit={post.canEdit}
          canWithdraw={post.canWithdraw}
        />
      </header>
      <div className="gc-post-meta">
        <time dateTime={post.createdAt.toISOString()}>
          {formatDate(post.createdAt)}
        </time>
        <span>
          <Globe aria-hidden="true" />
          {post.audience === "PUBLIC" ? "Public" : "Church members"}
        </span>
        <span className="gc-post-type">{postTypeLabels[post.type]}</span>
        {post.editedAt && <span>Edited</span>}
        {post.pinned && <span>Pinned notice</span>}
      </div>
      {post.topics.length > 0 && (
        <p className="text-sm text-gc-muted">
          Topics: {post.topics.join(", ")}
        </p>
      )}
      {post.eventOccurrenceId && (
        <Link
          className="inline-flex min-h-11 items-center text-gc-accent underline"
          href={`/platform/events/${post.eventOccurrenceId}`}
        >
          View event details and RSVP
        </Link>
      )}
      <PostText content={post.content} />
      <PostLink {...post} />
      {post.photoCount > 0 && (
        <PostPhotos postId={post.id} accountId={currentUserId ?? null} />
      )}
      {post.scripture && (
        <p className="gc-scripture">
          <span>Scripture reference</span>
          {post.scripture}
        </p>
      )}
      <div className="gc-post-actions" aria-label="Post actions">
        {fullDiscussion ? (
          <Link
            className="gc-post-action"
            href={`#discussion-${post.id}`}
            aria-label={`Comment, ${count} comments`}
          >
            <MessageCircle aria-hidden="true" />
            <span className="gc-post-action-label">Comment</span>
            <span>{count}</span>
          </Link>
        ) : (
          <CommentSheet postId={post.id} count={count} compact />
        )}

        {currentUserId ? (
          <form action={togglePlatformPostLike}>
            <PostActionPending />
            <input type="hidden" name="postId" value={post.id} />
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <button
              className="gc-post-action"
              type="submit"
              aria-pressed={liked}
              aria-label={liked ? "Unlike post" : "Like post"}
            >
              <Heart
                aria-hidden="true"
                className={liked ? "fill-current" : ""}
              />
              <span className="gc-post-action-label">
                {liked ? "Liked" : "Like"}
              </span>
              <span>{post.likeCount}</span>
            </button>
          </form>
        ) : (
          <Link
            className="gc-post-action"
            aria-label="Sign in to like this post"
            href={accountEntryHref(
              "join",
              `/platform/posts/${post.id}`,
              "like"
            )}
          >
            <Heart aria-hidden="true" />
            <span className="gc-post-action-label">Like</span>
            <span>{post.likeCount}</span>
          </Link>
        )}
        <SavePostControl postId={post.id} accountId={currentUserId ?? null} />
        <PublicShareControls kind="post" id={post.id} compact />
      </div>
      {(post.hasParticipation ||
        !!post.eventOccurrenceId ||
        (fullDiscussion && (post.canEdit || post.canOrganize))) && (
        <PostParticipation postId={post.id} manage={fullDiscussion} />
      )}
      {!fullDiscussion && (
        <Link
          className="inline-flex min-h-11 items-center text-sm text-gc-accent underline"
          href={`/platform/posts/${post.id}`}
        >
          View post and comments
        </Link>
      )}
      {fullDiscussion && (
        <div id={`discussion-${post.id}`} className="scroll-mt-4">
          <CommentThread postId={post.id} commentId={commentId} />
        </div>
      )}
    </article>
  );
}
