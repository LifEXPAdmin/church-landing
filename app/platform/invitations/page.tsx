import type { Metadata } from "next";
import Link from "next/link";
import { PlatformShell } from "@/components/platform/platform-shell";
import { FriendInvitations } from "@/components/platform/friend-invitations";
import { InstallationBanner } from "@/components/platform/installation-help";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My QR code",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};
export default async function Page() {
  const user = await getCurrentPlatformUser();
  return (
    <PlatformShell user={user}>
      <section className="container-shell mx-auto max-w-2xl space-y-5 py-8">
        <h1 className="text-4xl">My QR code</h1>
        <InstallationBanner />
        {user ? (
          <FriendInvitations accountId={user.id} />
        ) : (
          <>
            <p>Sign in to view your own invitation and signup connection.</p>
            <Link
              className="gc-button"
              href="/platform/login?next=%2Fplatform%2Finvitations"
            >
              Sign in
            </Link>
            <Link
              className="gc-button gc-button-quiet"
              href="/platform/share?qr=1"
            >
              Share Godschurches
            </Link>
          </>
        )}
      </section>
    </PlatformShell>
  );
}
