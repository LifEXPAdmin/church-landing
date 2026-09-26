"use client";
import Link from "next/link";
import type { getScheduledPosts } from "@/lib/platform/post-editor";
import { PrivateReadSnapshot } from "./private-read-snapshot";

type ScheduledPage = Awaited<ReturnType<typeof getScheduledPosts>>;

export function ScheduledPostList({
  owner,
  url
}: {
  owner: string;
  url: string;
}) {
  return (
    <PrivateReadSnapshot<ScheduledPage>
      owner={owner}
      url={url}
      label="scheduled posts"
      changedNotice="Your scheduled posts or publishing access changed. Reload to inspect current details."
    >
      {(page) => (
        <>
          {page.items.length ? (
            <ul className="space-y-4">
              {page.items.map((post) => (
                <li
                  key={post.id}
                  className="space-y-2 rounded-xl border border-gc-divider p-4"
                >
                  <h2 className="break-words text-xl">{post.church}</h2>
                  <p className="break-words">{post.excerpt}</p>
                  <p className="break-words text-sm">
                    {post.status === "SCHEDULED"
                      ? `${post.scheduleLocal?.replace("T", " ")} · ${post.scheduleZone}`
                      : "Draft · publication needs review"}
                  </p>
                  <Link
                    className="gc-button"
                    href={`/platform/scheduled-posts/${post.id}`}
                  >
                    Manage scheduled post
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>No unpublished church posts are available on this page.</p>
          )}
          {page.nextCursor && (
            <Link
              className="gc-button"
              href={`/platform/scheduled-posts?after=${page.nextCursor}`}
            >
              More scheduled posts
            </Link>
          )}
          {new URLSearchParams(url.split("?")[1]).has("after") && (
            <Link
              className="gc-button gc-button-quiet"
              href="/platform/scheduled-posts"
            >
              Back to first page
            </Link>
          )}
        </>
      )}
    </PrivateReadSnapshot>
  );
}
