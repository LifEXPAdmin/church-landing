import type { Metadata } from "next";
import { PlatformShell } from "@/components/platform/platform-shell";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
import { DraftLibrary } from "@/components/platform/draft-library";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const metadata: Metadata = {
  title: "Your drafts",
  robots: { index: false, follow: false }
};
export default async function DraftsPage() {
  const user = await getCurrentPlatformUser();
  return (
    <PlatformShell user={user}>
      {user ? (
        <section className="container-shell py-10">
          <div className="mx-auto max-w-2xl space-y-6">
            <h1 className="text-4xl">Your drafts</h1>
            <DraftLibrary key={user.id} ownerId={user.id} />
          </div>
        </section>
      ) : (
        <GuestAccountPrompt next="/platform/drafts" reason="account" />
      )}
    </PlatformShell>
  );
}
