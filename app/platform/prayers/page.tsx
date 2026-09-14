import type { Metadata } from "next";
import { PlatformShell } from "@/components/platform/platform-shell";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
import { SavedPrayers } from "@/components/platform/saved-prayers";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const metadata: Metadata = {
  title: "My private prayer list",
  robots: { index: false, follow: false }
};
export default async function PrayersPage({
  searchParams
}: {
  searchParams: Promise<{ after?: string }>;
}) {
  const [user, query] = await Promise.all([
    getCurrentPlatformUser(),
    searchParams
  ]);
  const after = typeof query.after === "string" ? query.after : undefined;
  return (
    <PlatformShell user={user}>
      {user ? (
        <section className="container-shell py-10">
          <div className="mx-auto max-w-2xl space-y-5">
            <h1 className="text-4xl">My private prayer list</h1>
            <SavedPrayers
              key={`${user.id}:${after ?? "first"}`}
              owner={user.id}
              after={after}
            />
          </div>
        </section>
      ) : (
        <GuestAccountPrompt next="/platform/prayers" reason="account" />
      )}
    </PlatformShell>
  );
}
