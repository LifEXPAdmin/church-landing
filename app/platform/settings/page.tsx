import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutPlatformAccount } from "@/app/platform/actions";
import { AccountForm } from "@/components/platform/account-form";
import { PlatformShell } from "@/components/platform/platform-shell";
import { Button } from "@/components/ui/button";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const metadata: Metadata = { title: "Account settings" };
export default async function PlatformSettingsPage() {
  const user = await getCurrentPlatformUser();
  if (!user) redirect("/platform/login");
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-10">
        <div className="mx-auto max-w-2xl space-y-6">
          <h1 className="text-5xl text-white">Account settings</h1>
          <div className="rounded-3xl border border-[#f2d8af]/20 bg-[#1a120c] p-6">
            <AccountForm operation="change-password" />
          </div>
          <div className="rounded-3xl border border-[#f2d8af]/20 bg-[#1a120c] p-6">
            <h2 className="text-3xl text-white">Email verification</h2>
            <p className="my-3 text-[#d8c4a8]">
              {user.emailVerifiedAt
                ? "Your account email has been verified."
                : "Your account email has not been verified."}
            </p>
            {!user.emailVerifiedAt && (
              <Link
                href="/platform/account/recover"
                className="text-[#f4c98c] underline"
              >
                Email verification options
              </Link>
            )}
          </div>
          <form action={logoutPlatformAccount}>
            <Button type="submit" className="rounded-full">
              Log out on this device
            </Button>
          </form>
        </div>
      </section>
    </PlatformShell>
  );
}
