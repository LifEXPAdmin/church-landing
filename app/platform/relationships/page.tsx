import type { Metadata } from "next";
import { PlatformShell } from "@/components/platform/platform-shell";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
import { RelationshipLibrary } from "@/components/platform/relationship-library";
import { relationshipView } from "@/lib/platform/relationship-navigation";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { readerId } from "@/lib/platform/reader-navigation";
export const metadata: Metadata = {
  title: "Your connections",
  robots: { index: false, follow: false }
};
export default async function RelationshipsPage({
  searchParams
}: {
  searchParams: Promise<{ view?: string; after?: string }>;
}) {
  const user = await getCurrentPlatformUser(),
    q = await searchParams;
  const view = relationshipView(q.view),
    after = readerId(q.after) ?? undefined;
  return (
    <PlatformShell user={user}>
      {user ? (
        <section className="container-shell py-10">
          <div className="mx-auto max-w-2xl space-y-5">
            <h1 className="text-4xl">Your connections</h1>
            <RelationshipLibrary
              key={`${user.id}-${view}-${after ?? "first"}`}
              owner={user.id}
              view={view}
              after={after}
            />
          </div>
        </section>
      ) : (
        <GuestAccountPrompt
          next={`/platform/relationships?${new URLSearchParams({ view, ...(after ? { after } : {}) })}`}
          reason="account"
        />
      )}
    </PlatformShell>
  );
}
