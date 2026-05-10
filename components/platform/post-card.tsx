import Link from "next/link";
import type {
  PlatformPost,
  PlatformPostComment,
  PlatformPostLike,
  PlatformUser
} from "@prisma/client";
import { Heart, MessageCircle, Trash2 } from "lucide-react";

import {
  createPlatformPostComment,
  deletePlatformPost,
  deletePlatformPostComment,
  togglePlatformPostLike
} from "@/app/platform/actions";

import { formatDate, postTypeLabels, roleLabels } from "@/lib/platform/format";

interface PostCardProps {
  post: PlatformPost & {
    author: PlatformUser;
    likes: PlatformPostLike[];
    comments: (PlatformPostComment & { author: PlatformUser })[];
  };
  currentUserId?: string;
  redirectTo?: string;
}

export function PostCard({
  post,
  currentUserId,
  redirectTo = "/platform"
}: PostCardProps) {
  const likedByCurrentUser = currentUserId
    ? post.likes.some((like) => like.userId === currentUserId)
    : false;
  const canDeletePost = currentUserId === post.authorId;

  return (
    <article className="border-[#f2d8af]/18 rounded-3xl border bg-[#1a120c] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <Link
          href={`/platform/profile/${post.author.username}`}
          className="flex items-center gap-3"
        >
          <div className="grid h-11 w-11 place-items-center rounded-full bg-[#c38a45] text-lg font-bold text-white">
            {post.author.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-white">{post.author.name}</p>
            <p className="text-sm text-[#cdbb9d]">
              @{post.author.username} · {roleLabels[post.author.role]}
            </p>
          </div>
        </Link>
        <div className="flex items-start gap-2 text-right text-xs text-[#cdbb9d]">
          <div>
            <p className="rounded-full border border-[#f2d8af]/20 px-3 py-1 text-[#f4c98c]">
              {postTypeLabels[post.type]}
            </p>
            <p className="mt-2">{formatDate(post.createdAt)}</p>
          </div>
          {canDeletePost ? (
            <form action={deletePlatformPost}>
              <input type="hidden" name="postId" value={post.id} />
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <button
                type="submit"
                className="rounded-full border border-red-200/20 p-2 text-red-100/70 hover:bg-red-950/40 hover:text-red-100"
                aria-label="Delete post"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </form>
          ) : null}
        </div>
      </div>
      <p className="whitespace-pre-wrap text-lg leading-relaxed text-[#f8ead6]">
        {post.content}
      </p>
      {post.scripture ? (
        <p className="bg-black/28 mt-4 rounded-2xl p-3 text-sm text-[#f4d7aa]">
          Scripture: {post.scripture}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <form action={togglePlatformPostLike}>
          <input type="hidden" name="postId" value={post.id} />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <button
            type="submit"
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm ${
              likedByCurrentUser
                ? "border-[#f4c98c]/50 bg-[#f4c98c]/20 text-[#fbe5c0]"
                : "border-[#f2d8af]/20 bg-black/24 text-[#d8c4a8] hover:bg-black/34"
            }`}
          >
            <Heart
              className={`h-4 w-4 ${likedByCurrentUser ? "fill-current" : ""}`}
            />
            {post.likes.length}
          </button>
        </form>
        <span className="inline-flex items-center gap-1 rounded-full border border-[#f2d8af]/20 bg-black/24 px-3 py-1.5 text-sm text-[#d8c4a8]">
          <MessageCircle className="h-4 w-4" /> {post.comments.length}
        </span>
      </div>

      {post.comments.length ? (
        <div className="mt-4 space-y-2">
          {post.comments.slice(0, 3).map((comment) => (
            <div
              key={comment.id}
              className="flex items-start justify-between gap-3 rounded-2xl bg-black/24 px-3 py-2 text-sm"
            >
              <p>
                <span className="font-semibold text-[#f8ead6]">
                  {comment.author.name}: {" "}
                </span>
                <span className="text-[#d8c4a8]">{comment.content}</span>
              </p>
              {currentUserId === comment.authorId ? (
                <form action={deletePlatformPostComment}>
                  <input type="hidden" name="commentId" value={comment.id} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <button
                    type="submit"
                    className="rounded-full p-1 text-red-100/50 hover:bg-red-950/40 hover:text-red-100"
                    aria-label="Delete comment"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {currentUserId ? (
        <form action={createPlatformPostComment} className="mt-3 flex gap-2">
          <input type="hidden" name="postId" value={post.id} />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <input
            name="content"
            minLength={2}
            maxLength={400}
            required
            placeholder="Add a comment"
            className="min-w-0 flex-1 rounded-full border border-[#f2d8af]/20 bg-[#120c08] px-4 py-2 text-sm text-[#f8ead6] outline-none placeholder:text-[#9c8b73] focus:border-[#f4c98c]"
          />
          <button
            type="submit"
            className="rounded-full bg-[#c38a45] px-4 py-2 text-sm font-semibold text-white hover:bg-[#aa7537]"
          >
            Send
          </button>
        </form>
      ) : null}
    </article>
  );
}
