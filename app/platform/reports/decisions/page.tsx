import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { contentNoticeHref } from "@/lib/platform/content-moderation-types";
import { ContentDecisionsWorkspace } from "@/components/platform/content-decisions-workspace";
import { readerId } from "@/lib/platform/reader-navigation";
import { PlatformShell } from "@/components/platform/platform-shell";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your content decisions",
  robots: { index: false, follow: false }
};

export default async function ContentDecisionsPage({
  searchParams
}: {
  searchParams: Promise<{ id?: string; after?: string }>;
}) {
  const user = await getCurrentPlatformUser(),
    q = await searchParams;
  const id = readerId(q.id),
    after = id ? undefined : readerId(q.after);
  if (!user)
    return (
      <PlatformShell user={null}>
        <GuestAccountPrompt
          next={contentNoticeHref(id, after)}
          reason="account"
        />
      </PlatformShell>
    );
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-10">
        <div className="mx-auto max-w-2xl space-y-5">
          <h1 className="text-3xl">Your content decisions</h1>
          <p>
            Private notices about your own content or a church you currently
            publish for. The explanation here is separate from the reporter’s
            identity and private review notes.
          </p>
          <nav className="flex flex-wrap gap-4">
            <Link
              prefetch={false}
              className="underline"
              href="/platform/activity?category=reports"
            >
              Report activity
            </Link>
            <Link
              prefetch={false}
              className="underline"
              href="/platform/reports"
            >
              Your submitted reports
            </Link>
            <Link
              prefetch={false}
              className="underline"
              href="/platform/help/requests"
            >
              Your help cases
            </Link>
          </nav>
          <ContentDecisionsWorkspace
            key={`${user.id}:${id ?? ""}:${after ?? ""}`}
            owner={user.id}
            id={id}
            after={after}
          />
        </div>
      </section>
    </PlatformShell>
  );
}
