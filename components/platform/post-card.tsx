import type { PublicProfile } from "@/lib/platform/public-profile";
import Link from "next/link";
import type {
  PlatformPost,
  PlatformPostComment,
  PlatformPostLike
} from "@prisma/client";
import { Heart, MessageCircle, Trash2, Globe } from "lucide-react";
import {
  createPlatformPostComment,
  deletePlatformPost,
  deletePlatformPostComment,
  togglePlatformPostLike
} from "@/app/platform/actions";
import { formatDate, postTypeLabels } from "@/lib/platform/format";

interface PostCardProps {
  post: PlatformPost & {
    author: PublicProfile;
    likes: PlatformPostLike[];
    comments: (PlatformPostComment & { author: PublicProfile })[];
    _count?: { comments: number };
  };
  currentUserId?: string;
  redirectTo?: string;
}
export function PostCard({
  post,
  currentUserId,
  redirectTo = "/platform"
}: PostCardProps) {
  const liked =
    !!currentUserId && post.likes.some((like) => like.userId === currentUserId);
  const count = post._count?.comments ?? post.comments.length;
  return (
    <article className="gc-post" aria-label={`Post by ${post.author.name}`}>
      <header className="gc-post-header">
        <Link
          href={`/platform/profile/${post.author.username}`}
          className="gc-post-author"
        >
          <span aria-hidden="true" className="gc-avatar">
            {post.author.name.charAt(0).toUpperCase()}
          </span>
          <span>
            <strong>{post.author.name}</strong>
            <span className="gc-post-handle">@{post.author.username}</span>
          </span>
        </Link>
        {currentUserId === post.authorId && (
          <form action={deletePlatformPost}>
            <input type="hidden" name="postId" value={post.id} />
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <button
              className="gc-icon-button text-gc-error"
              type="submit"
              aria-label="Delete post"
            >
              <Trash2 aria-hidden="true" />
            </button>
          </form>
        )}
      </header>
      <div className="gc-post-meta">
        <time dateTime={post.createdAt.toISOString()}>
          {formatDate(post.createdAt)}
        </time>
        <span>
          <Globe aria-hidden="true" />
          Public
        </span>
        <span className="gc-post-type">{postTypeLabels[post.type]}</span>
      </div>
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
              <span>{post.likes.length}</span>
            </button>
          </form>
        ) : (
          <Link className="gc-reaction" href="/platform/login">
            <Heart aria-hidden="true" />
            Sign in to like<span>{post.likes.length}</span>
          </Link>
        )}
      </div>
      <details className="gc-discussion">
        <summary>
          <MessageCircle aria-hidden="true" />
          Discussion{" "}
          <span>
            {count}
            {!post._count && post.comments.length === 6 ? "+" : ""}
          </span>
        </summary>
        {count > post.comments.length && (
          <p className="text-sm text-gc-muted">
            Showing the latest {post.comments.length} of {count} comments.
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
            {currentUserId === comment.authorId && (
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
        {currentUserId ? (
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
        ) : (
          <Link className="gc-reaction text-gc-action" href="/platform/login">
            Sign in to join the conversation
          </Link>
        )}
      </details>
    </article>
  );
}
