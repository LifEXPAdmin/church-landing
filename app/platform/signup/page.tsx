import type { Metadata } from "next";
import { AccountAccess } from "@/components/platform/account-access";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { safeAccountReturn, accountReason } from "@/lib/platform/account-entry";
import { googleAvailable } from "@/lib/platform/google-availability";
import { accountDeliveryAvailable } from "@/lib/platform/account-availability";
export const metadata: Metadata = {
  title: { absolute: "Create a Godschurches account" },
  description: "Create your account and start connecting in faith."
};
export default async function PlatformSignupPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const { next, reason } = await searchParams;
  const user = await getCurrentPlatformUser();
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-8 sm:py-10">
        <AccountAccess
          recoveryAvailable={accountDeliveryAvailable()}
          googleAvailable={googleAvailable() && !user}
          initialView="register"
          returnTo={safeAccountReturn(next)}
          reason={reason ? accountReason(reason) : undefined}
        />
      </section>
    </PlatformShell>
  );
}
