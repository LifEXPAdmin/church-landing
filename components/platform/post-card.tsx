import Link from "next/link";
import type { PlatformPost, PlatformUser } from "@prisma/client";

import { formatDate, postTypeLabels, roleLabels } from "@/lib/platform/format";

interface PostCardProps {
  post: PlatformPost & { author: PlatformUser };
}

export function PostCard({ post }: PostCardProps) {
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
        <div className="text-right text-xs text-[#cdbb9d]">
          <p className="rounded-full border border-[#f2d8af]/20 px-3 py-1 text-[#f4c98c]">
            {postTypeLabels[post.type]}
          </p>
          <p className="mt-2">{formatDate(post.createdAt)}</p>
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
    </article>
  );
}
