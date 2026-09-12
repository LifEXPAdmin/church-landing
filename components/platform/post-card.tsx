import { RepostControl } from "./repost-control";
import { RepostSourceBoundary } from "./repost-source-boundary";
import { SourcePreview } from "./quote-source-preview";
import { AuthorAvatar } from "./author-avatar";
import { PostPhotos } from "./post-photos";
import { PublicShareControls } from "./public-share-controls";
import { SavePostControl } from "./save-post-control";
import { PostMoreMenu } from "./post-more-menu";
import { CommentSheet } from "./comment-sheet";
import { CommentThread } from "./comment-thread";
import type { PostView } from "@/lib/platform/post-reads";
import { PostLink } from "./post-link";
import { PostLikeControl } from "./post-like-control";
import { accountEntryHref } from "@/lib/platform/account-entry";
import Link from "next/link";
import { Heart, Globe, MessageCircle } from "lucide-react";
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
  repostContext?: { entryId: string; entryVersion: number };
}
export function PostCard({
  post,
  currentUserId,
  redirectTo = "/platform",
  fullDiscussion = false,
  commentId,
  repostContext
}: PostCardProps) {
  if (post.repost?.kind === "PLAIN") {
    const source = post.repost.source;
    return (
      <section
        aria-label={`Reposted by ${post.author.name}`}
        className="min-w-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gc-border px-4 py-2 text-sm text-gc-muted">
          <span>
            <Link
              className="font-semibold underline"
              href={
                post.author.churchId
                  ? `/platform/churches/${post.author.churchId}`
                  : `/platform/profile/${post.author.username}`
              }
            >
              {post.author.name}
            </Link>{" "}
            reposted ·{" "}
            <time dateTime={post.createdAt.toISOString()}>
              {formatDate(post.createdAt)}
            </time>
            {post.audience === "CHURCH" ? " · Church members" : ""}
          </span>
          {post.repost.canUndo && (
            <RepostControl
              postId={source?.id ?? post.id}
              accountId={currentUserId ?? null}
              ownEntry={{ id: post.id, version: post.version }}
              undoOnly
            />
          )}
        </div>
        {source ? (
          <PostCard
            post={{ ...source, repost: null }}
            currentUserId={currentUserId}
            redirectTo={redirectTo}
            fullDiscussion={fullDiscussion}
            commentId={commentId}
            repostContext={{ entryId: post.id, entryVersion: post.version }}
          />
        ) : (
          <RepostSourceBoundary
            entryId={post.id}
            entryVersion={post.version}
            sourceVersion={null}
            accountId={currentUserId ?? null}
          >
            {null}
          </RepostSourceBoundary>
        )}
      </section>
    );
  }
  const count = post.commentCount;
  return (
    <article className="gc-post" aria-label={`Post by ${post.author.name}`}>
      {repostContext ? (
        <RepostSourceBoundary
          entryId={repostContext.entryId}
          entryVersion={repostContext.entryVersion}
          sourceVersion={post.version}
          accountId={currentUserId ?? null}
        >
          <SourcePreview source={post} accountId={currentUserId ?? null} />
        </RepostSourceBoundary>
      ) : (
        <>
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
        </>
      )}
      {post.repost?.kind === "QUOTE" && (
        <RepostSourceBoundary
          entryId={post.id}
          entryVersion={post.version}
          sourceVersion={post.repost.source?.version ?? null}
          accountId={currentUserId ?? null}
        >
          {post.repost.source && (
            <SourcePreview
              source={post.repost.source}
              accountId={currentUserId ?? null}
            />
          )}
        </RepostSourceBoundary>
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
          <PostLikeControl
            key={`${currentUserId}-${post.id}`}
            postId={post.id}
            owner={currentUserId}
            initial={{
              liked: post.liked,
              version: post.likeVersion,
              count: post.likeCount
            }}
          />
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
        <RepostControl postId={post.id} accountId={currentUserId ?? null} />
        <SavePostControl postId={post.id} accountId={currentUserId ?? null} />
        <PublicShareControls kind="post" id={post.id} compact />
      </div>
      {!repostContext &&
        (post.hasParticipation ||
          !!post.eventOccurrenceId ||
          (fullDiscussion && (post.canEdit || post.canOrganize))) && (
          <PostParticipation postId={post.id} manage={fullDiscussion} />
        )}
      {(!fullDiscussion || repostContext) && (
        <Link
          className="inline-flex min-h-11 items-center text-sm text-gc-accent underline"
          href={`/platform/posts/${post.id}`}
        >
          {repostContext
            ? "View original post and comments"
            : "View post and comments"}
        </Link>
      )}
      {fullDiscussion && (
        <div id={`discussion-${post.id}`} className="scroll-mt-4">
          <CommentThread
            postId={post.id}
            commentId={commentId}
            initiallyClosed={post.discussionClosed}
          />
        </div>
      )}
    </article>
  );
}
