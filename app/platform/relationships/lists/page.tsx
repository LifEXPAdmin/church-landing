import type { Metadata } from "next";
import Link from "next/link";
import { PlatformShell } from "@/components/platform/platform-shell";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
import { FollowingLists } from "@/components/platform/following-lists";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { readerId } from "@/lib/platform/reader-navigation";
export const metadata: Metadata = {
  title: "Private following lists",
  robots: { index: false, follow: false }
};
export default async function FollowingListsPage({
  searchParams
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  const user = await getCurrentPlatformUser(),
    params = await searchParams,
    listId = readerId(params.list) ?? undefined;
  return (
    <PlatformShell user={user}>
      {user ? (
        <section className="container-shell py-10">
          <div className="mx-auto max-w-2xl space-y-5">
            <Link
              className="inline-flex min-h-11 items-center underline"
              href="/platform/relationships"
            >
              Back to connections
            </Link>
            <h1 className="text-4xl">Private following lists</h1>
            <FollowingLists
              key={`${user.id}-${listId ?? "all"}`}
              owner={user.id}
              listId={listId}
            />
          </div>
        </section>
      ) : (
        <GuestAccountPrompt
          next="/platform/relationships/lists"
          reason="account"
        />
      )}
    </PlatformShell>
  );
}
