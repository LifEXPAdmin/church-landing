import type { Metadata } from "next";
import Link from "next/link";
import { AccountForm } from "@/components/platform/account-form";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const metadata: Metadata = {
  title: "Godschurches account",
  description: "Sign in to your Godschurches account."
};
export default async function PlatformLoginPage({
  searchParams
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const user = await getCurrentPlatformUser();
  const { notice } = await searchParams;
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-10">
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-[#f2d8af]/20 bg-[#1a120c] p-6 sm:p-8">
          <h1 className="text-5xl text-white">Your Godschurches account</h1>
          <p className="my-4 text-[#d8c4a8]">
            Sign in to the preview or create your own account. Your email is
            used privately for account access.
          </p>
          {notice === "password-changed" && (
            <p role="status" className="mb-6 text-[#f4c98c]">
              Your password was changed and all devices were signed out. Sign in
              with your new password.
            </p>
          )}
          <div className="grid gap-10 md:grid-cols-2">
            <AccountForm operation="login" />
            <AccountForm operation="register" />
          </div>
          <div className="mt-8 flex flex-wrap gap-6 text-[#f4c98c]">
            <Link href="/platform/account/recover" className="underline">
              Forgot your password?
            </Link>
            <Link href="/platform">Browse the preview</Link>
          </div>
          <p className="mt-4 text-sm text-[#d8c4a8]">
            Older accounts without passwords require verified recovery.
            Registering again will not change an existing account.
          </p>
        </div>
      </section>
    </PlatformShell>
  );
}
