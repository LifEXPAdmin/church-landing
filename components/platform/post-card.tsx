import { SavePostControl } from "./save-post-control";
import { RelationshipControls } from "./relationship-controls";
import { CommentSheet } from "./comment-sheet";
import { CommentThread } from "./comment-thread";
import type { PostView } from "@/lib/platform/post-reads";
import { PostLink } from "./post-link";
import { PostActionPending } from "./post-action-pending";
import { accountEntryHref } from "@/lib/platform/account-entry";
import Link from "next/link";
import { Heart, Globe } from "lucide-react";
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
        {post.canWithdraw && !fullDiscussion && (
          <Link
            href={`/platform/posts/${post.id}`}
            className="inline-flex min-h-11 items-center text-sm text-gc-accent underline"
          >
            Manage post
          </Link>
        )}
      </header>
      {currentUserId !== post.author.id && (
        <RelationshipControls
          kind={post.author.churchId ? "church" : "person"}
          targetId={post.author.churchId ?? post.author.id}
          name={post.author.name}
        />
      )}
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
      {post.scripture && (
        <p className="gc-scripture">
          <span>Scripture reference</span>
          {post.scripture}
        </p>
      )}
      <SavePostControl postId={post.id} />
      <div className="gc-post-actions">
        {currentUserId ? (
          <form action={togglePlatformPostLike}>
            <PostActionPending />
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
      {fullDiscussion ? (
        <CommentThread postId={post.id} commentId={commentId} />
      ) : (
        <CommentSheet postId={post.id} count={count} />
      )}
    </article>
  );
}
