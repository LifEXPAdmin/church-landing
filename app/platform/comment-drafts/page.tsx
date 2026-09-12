import type { Metadata } from "next";
import { PlatformShell } from "@/components/platform/platform-shell";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
import { CommentDraftLibrary } from "@/components/platform/comment-draft-library";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const metadata: Metadata = {
  title: "Your comment drafts",
  robots: { index: false, follow: false }
};
export default async function CommentDraftsPage() {
  const user = await getCurrentPlatformUser();
  return (
    <PlatformShell user={user}>
      {user ? (
        <section className="container-shell py-10">
          <div className="mx-auto max-w-2xl space-y-6">
            <h1 className="text-4xl">Your comment drafts</h1>
            <CommentDraftLibrary key={user.id} owner={user.id} />
          </div>
        </section>
      ) : (
        <GuestAccountPrompt next="/platform/comment-drafts" reason="account" />
      )}
    </PlatformShell>
  );
}
