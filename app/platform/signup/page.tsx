import type { Metadata } from "next";
import { AccountAccess } from "@/components/platform/account-access";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const metadata: Metadata = {
  title: "Create a Godschurches account",
  description: "Create your account and start connecting in faith."
};
export default async function PlatformSignupPage() {
  const user = await getCurrentPlatformUser();
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-8 sm:py-10">
        <AccountAccess initialView="register" />
      </section>
    </PlatformShell>
  );
}
