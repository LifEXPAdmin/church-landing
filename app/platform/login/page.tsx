import type { Metadata } from "next";
import { AccountAccess } from "@/components/platform/account-access";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { safeAccountReturn, accountReason } from "@/lib/platform/account-entry";
export const metadata: Metadata = {
  title: { absolute: "Sign in to Godschurches" },
  description: "Sign in securely with your email and password."
};
export default async function PlatformLoginPage({
  searchParams
}: {
  searchParams: Promise<{ notice?: string; next?: string; reason?: string }>;
}) {
  const user = await getCurrentPlatformUser();
  const { notice, next, reason } = await searchParams;
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-8 sm:py-10">
        <AccountAccess
          initialView="login"
          returnTo={safeAccountReturn(next)}
          reason={reason ? accountReason(reason) : undefined}
          passwordChanged={notice === "password-changed"}
          reactivated={notice === "reactivated"}
          emailChanged={notice === "email-changed"}
        />
      </section>
    </PlatformShell>
  );
}
