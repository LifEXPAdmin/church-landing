import type { Metadata } from "next";
import Link from "next/link";
import { RecoveryForm } from "@/components/platform/recovery-form";
import { accountDeliveryAvailable } from "@/lib/platform/account-availability";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { prisma } from "@/lib/prisma";
import { safeAccountReturn } from "@/lib/platform/account-entry";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Verify your email",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};
export default async function VerificationPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeAccountReturn((await searchParams).next);
  const user = await getCurrentPlatformUser();
  // The shared user projection deliberately omits private account email.
  // Fetch only this signed-in owner's address for their verification form.
  const account = user
    ? await prisma.platformUser.findUnique({
        where: { id: user.id },
        select: { email: true }
      })
    : null;
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-10">
        <div className="mx-auto max-w-xl space-y-6 rounded-xl border border-gc-divider bg-gc-surface p-6 text-gc-text sm:p-8">
          <RecoveryForm
            available={accountDeliveryAvailable()}
            purpose="VERIFY_EMAIL"
            initialEmail={account?.email ?? ""}
            verified={!!user?.emailVerifiedAt}
            signedIn={!!user}
          />
          {next !== "/platform" && (
            <div className="space-y-2">
              <p>
                After verifying, return here to refresh your account and
                connection. If the email opens in another browser, keep this tab
                open.
              </p>
              <Link className="gc-button" href={next}>
                Return to your invitation or previous page
              </Link>
            </div>
          )}
          <Link
            href={user ? "/platform/settings" : "/platform/login"}
            className="inline-flex min-h-11 items-center text-gc-accent underline"
          >
            {user ? "Back to account settings" : "Back to sign in"}
          </Link>
        </div>
      </section>
    </PlatformShell>
  );
}
