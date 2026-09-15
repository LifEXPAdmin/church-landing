import type { Metadata } from "next";
import Link from "next/link";
import { PlatformShell } from "@/components/platform/platform-shell";
import { OnboardingHome } from "@/components/platform/onboarding-home";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { accountEntryHref } from "@/lib/platform/account-entry";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Getting started | God’s Churches" },
  robots: { index: false, follow: false }
};
export default async function Page() {
  const user = await getCurrentPlatformUser();
  return (
    <PlatformShell user={user}>
      <main className="container-shell max-w-3xl py-8">
        <h1>Getting started</h1>
        {user ? (
          <OnboardingHome ownerId={user.id} full />
        ) : (
          <div className="space-y-4">
            <p>
              Create an account or sign in to save your next steps. You can
              explore the community first.
            </p>
            <Link
              className="gc-button"
              href={accountEntryHref("signup", "/platform/getting-started")}
            >
              Create account
            </Link>
            <Link
              className="gc-button gc-button-quiet"
              href={accountEntryHref("login", "/platform/getting-started")}
            >
              Sign in
            </Link>
            <Link
              className="gc-button gc-button-quiet"
              href="/platform/churches"
            >
              Explore churches
            </Link>
          </div>
        )}
      </main>
    </PlatformShell>
  );
}
