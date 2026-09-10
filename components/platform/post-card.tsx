import type { PostView } from "@/lib/platform/post-reads";
import { accountEntryHref } from "@/lib/platform/account-entry";
import Link from "next/link";
import { Heart, MessageCircle, Trash2, Globe } from "lucide-react";
import {
  createPlatformPostComment,
  deletePlatformPost,
  deletePlatformPostComment,
  togglePlatformPostLike
} from "@/app/platform/actions";
import { formatDate, postTypeLabels } from "@/lib/platform/format";
import { PostParticipation } from "./post-participation";

interface PostCardProps {
  post: PostView;
  currentUserId?: string;
  redirectTo?: string;
  fullDiscussion?: boolean;
  moreCommentsHref?: string;
}
export function PostCard({
  post,
  currentUserId,
  redirectTo = "/platform",
  fullDiscussion = false,
  moreCommentsHref
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
          <span aria-hidden="true" className="gc-avatar">
            {post.author.name.charAt(0).toUpperCase()}
          </span>
          <span>
            <strong>{post.author.name}</strong>
            <span className="gc-post-handle">
              {post.author.churchId ? "Church" : `@${post.author.username}`}
            </span>
          </span>
        </Link>
        {post.canWithdraw && (
          <details className="gc-post-removal text-sm">
            <summary className="cursor-pointer py-2">Remove post</summary>
            <form action={deletePlatformPost} className="space-y-2">
              <input
                type="hidden"
                name="expectedVersion"
                value={post.version}
              />
              <label className="flex items-start gap-2">
                <input type="checkbox" name="confirmed" required />
                Remove this post and its discussion from view.
              </label>
              <input type="hidden" name="postId" value={post.id} />
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <button className="gc-button text-gc-error" type="submit">
                <Trash2 aria-hidden="true" />
                Confirm removal
              </button>
            </form>
          </details>
        )}
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
      <p className="gc-post-body">{post.content}</p>
      {post.scripture && (
        <p className="gc-scripture">
          <span>Scripture reference</span>
          {post.scripture}
        </p>
      )}
      <div className="gc-post-actions">
        {currentUserId ? (
          <form action={togglePlatformPostLike}>
            <input type="hidden" name="postId" value={post.id} />
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <button className="gc-reaction" type="submit" aria-pressed={liked}>
              <Heart
                aria-hidden="true"
                className={liked ? "fill-current" : ""}
              />
              {liked ? "Liked" : "Like"}
              <span>{post.likeCount}</span>
            </button>
          </form>
        ) : (
          <Link
            className="gc-reaction"
            href={accountEntryHref(
              "join",
              `/platform/posts/${post.id}`,
              "like"
            )}
          >
            <Heart aria-hidden="true" />
            Like<span>{post.likeCount}</span>
          </Link>
        )}
      </div>
      {(post.hasParticipation ||
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
      <details className="gc-discussion" open={fullDiscussion}>
        <summary>
          <MessageCircle aria-hidden="true" />
          Discussion <span>{count}</span>
        </summary>
        {count > post.comments.length && (
          <p className="text-sm text-gc-muted">
            Showing {post.comments.length} of {count} comments.{" "}
            {!fullDiscussion && (
              <Link className="underline" href={`/platform/posts/${post.id}`}>
                Read all comments
              </Link>
            )}
          </p>
        )}
        {!post.comments.length && (
          <p className="text-sm text-gc-muted">
            No comments yet. Make room for a thoughtful conversation.
          </p>
        )}
        {post.comments.map((comment) => (
          <div key={comment.id} className="gc-comment">
            <div>
              <Link
                href={`/platform/profile/${comment.author.username}`}
                className="font-semibold text-gc-action"
              >
                {comment.author.name}
              </Link>
              <p>{comment.content}</p>
            </div>
            {comment.canDelete && (
              <form action={deletePlatformPostComment}>
                <input type="hidden" name="commentId" value={comment.id} />
                <input type="hidden" name="redirectTo" value={redirectTo} />
                <button
                  className="gc-icon-button text-gc-error"
                  type="submit"
                  aria-label="Delete comment"
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </form>
            )}
          </div>
        ))}
        {moreCommentsHref && (
          <Link
            className="inline-flex min-h-11 items-center text-gc-accent underline"
            href={moreCommentsHref}
          >
            Older comments
          </Link>
        )}
        {post.canReply ? (
          <form action={createPlatformPostComment} className="gc-comment-form">
            <input type="hidden" name="postId" value={post.id} />
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <label htmlFor={`comment-${post.id}`}>Add a comment</label>
            <div>
              <input
                id={`comment-${post.id}`}
                name="content"
                minLength={2}
                maxLength={400}
                required
                placeholder="Write with kindness"
              />
              <button type="submit" className="gc-button">
                Send
              </button>
            </div>
          </form>
        ) : post.discussionClosed || currentUserId ? (
          <p className="text-sm text-gc-muted">
            {post.discussionClosed
              ? "This discussion is closed to new replies."
              : "Replies are limited to approved church members."}
          </p>
        ) : (
          <Link
            className="gc-reaction text-gc-action"
            href={accountEntryHref(
              "join",
              `/platform/posts/${post.id}`,
              "comment"
            )}
          >
            Add a comment
          </Link>
        )}
      </details>
    </article>
  );
}
