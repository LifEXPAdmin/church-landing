import Link from "next/link";
import type { Metadata } from "next";
import { PlatformShell } from "@/components/platform/platform-shell";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
import { ScheduledPostList } from "@/components/platform/scheduled-post-list";
import { getCurrentPlatformUser } from "@/lib/platform/session";
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
            <ScheduledPostList
              key={`${user.id}:${url}`}
              owner={user.id}
              url={url}
            />
          </div>
        </section>
      ) : (
        <GuestAccountPrompt next="/platform/scheduled-posts" reason="account" />
      )}
    </PlatformShell>
  );
}
