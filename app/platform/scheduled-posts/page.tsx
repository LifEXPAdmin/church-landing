import { createHash } from "node:crypto";
import Link from "next/link";
import type { Metadata } from "next";
import { PlatformShell } from "@/components/platform/platform-shell";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
import { PrivateSnapshotGuard } from "@/components/platform/private-snapshot-guard";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { readScheduledPosts } from "@/lib/platform/post-session";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Scheduled church posts",
  robots: { index: false, follow: false }
};
export default async function ScheduledPostsPage({
  searchParams
}: {
  searchParams: Promise<{ after?: string }>;
}) {
  const user = await getCurrentPlatformUser();
  const { after } = await searchParams;
  const page = user ? await readScheduledPosts(after).catch(() => null) : null;
  const url = `/api/platform/posts?${new URLSearchParams({ view: "scheduled", ...(after ? { after } : {}) })}`;
  return (
    <PlatformShell user={user}>
      {user ? (
        <section className="container-shell py-10">
          <div className="mx-auto max-w-2xl space-y-6">
            <h1 className="text-4xl">Scheduled church posts</h1>
            <p>
              Manage unpublished posts for churches where you currently have
              publishing access. Canceled, blocked and restored plans remain
              drafts until a publisher reviews and schedules them again.
            </p>
            <Link className="gc-button gc-button-quiet" href="/platform/drafts">
              Your private drafts
            </Link>
            {page ? (
              <PrivateSnapshotGuard
                owner={user.id}
                url={url}
                checksum={createHash("sha256")
                  .update(JSON.stringify(page))
                  .digest("hex")}
                label="scheduled posts"
              >
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
                {after && (
                  <Link
                    className="gc-button gc-button-quiet"
                    href="/platform/scheduled-posts"
                  >
                    Back to first page
                  </Link>
                )}
              </PrivateSnapshotGuard>
            ) : (
              <p role="status">
                Scheduled posts could not be loaded. Reload to check your
                current access.
              </p>
            )}
          </div>
        </section>
      ) : (
        <GuestAccountPrompt next="/platform/scheduled-posts" reason="account" />
      )}
    </PlatformShell>
  );
}
