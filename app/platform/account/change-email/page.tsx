import type { Metadata } from "next";
import { AccountEmailChange } from "@/components/platform/account-email-change";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { accountConfig } from "@/lib/platform/account-config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Confirm sign-in email",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};
export default async function ChangeEmailPage() {
  const user = await getCurrentPlatformUser();
  let available = false;
  try {
    available = accountConfig().delivery !== "disabled";
  } catch {
    /* Fail closed when delivery is unavailable. */
  }
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-10">
        <div className="mx-auto max-w-2xl space-y-5">
          <h1 className="text-4xl text-gc-text">Your sign-in email</h1>
          <AccountEmailChange available={available} signedIn={!!user} confirm />
        </div>
      </section>
    </PlatformShell>
  );
}
