import type { Metadata } from "next";
import Link from "next/link";
import { PlatformShell } from "@/components/platform/platform-shell";
import { ChurchWelcomeHost } from "@/components/platform/church-welcome-host";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { accountEntryHref } from "@/lib/platform/account-entry";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Church welcome | God’s Churches" },
  robots: { index: false, follow: false }
};
export default async function Page({
  params
}: {
  params: Promise<{ churchId: string }>;
}) {
  const user = await getCurrentPlatformUser(),
    { churchId } = await params;
  return (
    <PlatformShell user={user}>
      <main className="container-shell max-w-3xl py-8">
        {user ? (
          <ChurchWelcomeHost ownerId={user.id} churchId={churchId} />
        ) : (
          <>
            <h1>Church welcome</h1>
            <p>Sign in to check your church permissions.</p>
            <Link
              className="gc-button"
              href={accountEntryHref(
                "login",
                "/platform/churches/" +
                  encodeURIComponent(churchId) +
                  "/welcome"
              )}
            >
              Sign in
            </Link>
          </>
        )}
      </main>
    </PlatformShell>
  );
}
