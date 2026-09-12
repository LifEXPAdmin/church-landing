import type { Metadata } from "next";
import { PlatformShell } from "@/components/platform/platform-shell";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
import { SavedLibrary } from "@/components/platform/saved-library";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { readerId } from "@/lib/platform/reader-navigation";
export const metadata: Metadata = {
  title: "Bookmarks",
  robots: { index: false, follow: false }
};
export default async function SavedPage({
  searchParams
}: {
  searchParams: Promise<{ collectionId?: string; after?: string }>;
}) {
  const user = await getCurrentPlatformUser(),
    q = await searchParams;
  const collectionId = readerId(q.collectionId) ?? undefined,
    after = readerId(q.after) ?? undefined;
  return (
    <PlatformShell user={user}>
      {user ? (
        <section className="container-shell py-10">
          <div className="mx-auto max-w-2xl space-y-5">
            <h1 className="text-4xl">Bookmarks</h1>
            <SavedLibrary
              key={`${user.id}-${collectionId ?? "all"}-${after ?? "first"}`}
              owner={user.id}
              collectionId={collectionId}
              after={after}
            />
          </div>
        </section>
      ) : (
        <GuestAccountPrompt
          next={`/platform/saved?${new URLSearchParams({ ...(collectionId ? { collectionId } : {}), ...(after ? { after } : {}) })}`}
          reason="account"
        />
      )}
    </PlatformShell>
  );
}
