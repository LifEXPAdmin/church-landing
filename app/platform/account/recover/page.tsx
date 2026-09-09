import type { Metadata } from "next";
import Link from "next/link";
import { RecoveryForm } from "@/components/platform/recovery-form";
import { accountConfig } from "@/lib/platform/account-config";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Account recovery",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};
export default async function RecoveryPage() {
  const user = await getCurrentPlatformUser();
  let available = false;
  try {
    available = accountConfig().delivery !== "disabled";
  } catch {
    /* A missing sender is unavailable, not a successful delivery. */
  }
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-10">
        <div className="mx-auto max-w-xl rounded-xl border border-gc-divider bg-gc-surface p-6 text-gc-text sm:p-8">
          <h1 className="mb-6 text-4xl text-gc-text">Account recovery</h1>
          <RecoveryForm available={available} />
          <Link
            href="/platform/login"
            className="mt-8 block text-gc-accent underline"
          >
            Back to sign in
          </Link>
        </div>
      </section>
    </PlatformShell>
  );
}
