import type { Metadata } from "next";
import { AccountLifecycle } from "@/components/platform/account-lifecycle";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { GoogleButton } from "@/components/platform/google-account";
import { googleAvailable } from "@/lib/platform/google-availability";

export const metadata: Metadata = {
  title: { absolute: "Reactivate your account | Godschurches" },
  robots: { index: false, follow: false }
};

export default async function ReactivatePage({
  searchParams
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const user = await getCurrentPlatformUser();
  const { notice } = await searchParams;
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-8 sm:py-10">
        <div className="mx-auto max-w-2xl space-y-5">
          <h1 className="text-4xl text-gc-text">Return to Godschurches</h1>
          {notice === "deactivated" && (
            <p role="status" className="text-gc-accent">
              Your account is deactivated and all devices are signed out. You
              can leave this page and return whenever you are ready.
            </p>
          )}
          {!user && googleAvailable() && (
            <div className="gc-settings">
              <h2>Return with Google</h2>
              <p className="text-gc-muted">
                If Google is linked to your account, sign in with it and confirm
                reactivation on the next page.
              </p>
              <GoogleButton body={{ operation: "start", next: "/platform" }} />
            </div>
          )}
          <AccountLifecycle reactivate />
        </div>
      </section>
    </PlatformShell>
  );
}
