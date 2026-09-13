import type { Metadata } from "next";
import { AccountDeletion } from "@/components/platform/account-deletion";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const metadata: Metadata = {
  title: "Account deletion progress",
  robots: { index: false, follow: false }
};
export default async function Page() {
  return (
    <PlatformShell user={await getCurrentPlatformUser()}>
      <section className="container-shell max-w-3xl py-8">
        <h1 className="mb-5 text-3xl">Your deletion request</h1>
        <AccountDeletion />
      </section>
    </PlatformShell>
  );
}
