import type { Metadata } from "next";
import Link from "next/link";
import { PlatformShell } from "@/components/platform/platform-shell";
import { GoogleAccountOptions } from "@/components/platform/google-account";
import { GoogleOnboarding } from "@/components/platform/google-onboarding";
import { googleAvailable } from "@/lib/platform/google-availability";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your Google sign-in",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};
export default function GoogleAccountPage() {
  const available = googleAvailable();
  return (
    <PlatformShell user={null}>
      <section className="container-shell py-10">
        <div className="mx-auto max-w-xl">
          {available ? (
            <GoogleAccountOptions enabled>
              <GoogleOnboarding />
            </GoogleAccountOptions>
          ) : (
            <div className="gc-settings">
              <h1 className="text-4xl">Google sign-in is not available yet</h1>
              <Link href="/platform/login" className="text-gc-accent underline">
                Use email sign-in
              </Link>
              <Link href="/platform" className="text-gc-accent underline">
                Keep browsing
              </Link>
            </div>
          )}
        </div>
      </section>
    </PlatformShell>
  );
}
