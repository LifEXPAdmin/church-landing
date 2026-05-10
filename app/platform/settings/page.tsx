import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  changePlatformPassword,
  logoutPlatformAccount
} from "@/app/platform/actions";
import { PlatformShell } from "@/components/platform/platform-shell";
import { Button } from "@/components/ui/button";
import { getCurrentPlatformUser } from "@/lib/platform/session";

export const metadata: Metadata = {
  title: "Church Account Settings",
  description: "Manage your Church platform account settings."
};

const errorMessages: Record<string, string> = {
  password: "Use at least 8 characters and make sure the new passwords match.",
  current: "Your current password did not match.",
  session: "Please log out and sign back in before changing your password."
};

export default async function PlatformSettingsPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const currentUser = await getCurrentPlatformUser();
  const params = await searchParams;

  if (!currentUser) {
    redirect("/platform/login");
  }

  return (
    <PlatformShell user={currentUser}>
      <section className="container-shell py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="rounded-[2rem] border border-[#f2d8af]/20 bg-[#1a120c] p-6 text-[#f8ead6] sm:p-8">
            <p className="text-sm uppercase tracking-[0.16em] text-[#f4c98c]">
              Account Settings
            </p>
            <h1 className="mt-1 text-5xl text-white">Protect your account</h1>
            <p className="mt-2 text-[#d8c4a8]">
              Keep your Church account secure while the platform is still in
              preview. More account controls will be added here as the product
              grows.
            </p>
          </div>

          {params.updated === "password" ? (
            <p className="rounded-2xl border border-emerald-200/20 bg-emerald-950/30 p-4 text-sm text-emerald-100">
              Password updated.
            </p>
          ) : null}

          {params.error ? (
            <p className="rounded-2xl border border-red-200/20 bg-red-950/40 p-4 text-sm text-red-100">
              {errorMessages[params.error] ?? "That did not work. Try again."}
            </p>
          ) : null}

          <form
            action={changePlatformPassword}
            className="space-y-4 rounded-[2rem] border border-[#f2d8af]/20 bg-[#1a120c] p-6 sm:p-8"
          >
            <div>
              <h2 className="text-3xl text-white">Change password</h2>
              <p className="mt-1 text-sm text-[#d8c4a8]">
                Use a password you do not reuse on other websites.
              </p>
            </div>
            <input
              name="currentPassword"
              required
              type="password"
              placeholder="Current password"
              className="w-full rounded-2xl border border-[#f2d8af]/20 bg-[#100b07] px-4 py-3 text-[#f8ead6] outline-none focus:border-[#f4c98c]"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                name="newPassword"
                required
                type="password"
                minLength={8}
                placeholder="New password"
                className="w-full rounded-2xl border border-[#f2d8af]/20 bg-[#100b07] px-4 py-3 text-[#f8ead6] outline-none focus:border-[#f4c98c]"
              />
              <input
                name="confirmPassword"
                required
                type="password"
                minLength={8}
                placeholder="Confirm new password"
                className="w-full rounded-2xl border border-[#f2d8af]/20 bg-[#100b07] px-4 py-3 text-[#f8ead6] outline-none focus:border-[#f4c98c]"
              />
            </div>
            <Button type="submit" className="rounded-full px-8">
              Update password
            </Button>
          </form>

          <div className="rounded-[2rem] border border-[#f2d8af]/20 bg-black/20 p-6 sm:p-8">
            <h2 className="text-3xl text-white">Session</h2>
            <p className="mt-1 text-sm text-[#d8c4a8]">
              Log out on this device when you are done testing.
            </p>
            <form action={logoutPlatformAccount} className="mt-4">
              <Button
                type="submit"
                className="rounded-full border-[#f2d8af]/30 bg-transparent text-[#f8ead6] hover:bg-white/10"
              >
                Log out
              </Button>
            </form>
          </div>
        </div>
      </section>
    </PlatformShell>
  );
}
