import type { Metadata } from "next";
import Link from "next/link";

import {
  createPlatformAccount,
  loginPlatformAccount
} from "@/app/platform/actions";
import { PlatformShell } from "@/components/platform/platform-shell";
import { Button } from "@/components/ui/button";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { PlatformRole } from "@prisma/client";

export const metadata: Metadata = {
  title: "Create a Church Account",
  description: "Create or enter your Church platform preview account."
};

const errorMessages: Record<string, string> = {
  invalid: "Check every field, make sure passwords match, and use at least 8 characters.",
  exists: "That email already has a secured account. Log in instead.",
  username: "That username is already taken. Try another one.",
  login: "That email and password did not match.",
  missing: "We could not find an account with that email.",
  "needs-password": "This older test account needs to be secured. Create an account again with the same email and username to add a password."
};

export default async function PlatformLoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const currentUser = await getCurrentPlatformUser();
  const params = await searchParams;
  const errorMessage = params.error
    ? errorMessages[params.error] ?? "That did not work. Check the fields and try again."
    : null;

  return (
    <PlatformShell user={currentUser}>
      <section className="container-shell py-10">
        <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] border border-[#f2d8af]/20 bg-[#1a120c] lg:grid-cols-2">
          <div className="bg-[linear-gradient(160deg,#2a1d12,#100b07)] p-8 text-[#f8ead6] sm:p-10">
            <p className="mb-3 text-sm uppercase tracking-[0.18em] text-[#f4c98c]">
              Platform Account
            </p>
            <h1 className="text-5xl leading-tight text-white">
              Enter the Church preview.
            </h1>
            <p className="mt-4 text-[#d8c4a8]">
              Accounts now use passwords and secure session tokens. This is
              still an early preview, but the foundation is moving toward real
              member access.
            </p>
            <Link
              href="/platform"
              className="mt-8 inline-flex text-[#f4c98c] hover:text-[#ffe0b1]"
            >
              View preview without signing in
            </Link>
          </div>

          <div className="space-y-8 p-6 sm:p-8">
            {errorMessage ? (
              <p className="rounded-2xl bg-red-950/40 p-3 text-sm text-red-100">
                {errorMessage}
              </p>
            ) : null}

            <form action={createPlatformAccount} className="space-y-4">
              <div>
                <p className="text-sm uppercase tracking-[0.16em] text-[#f4c98c]">
                  New here
                </p>
                <h2 className="mt-1 text-3xl text-white">Create account</h2>
              </div>
              <input
                name="name"
                required
                placeholder="Full name"
                className="w-full rounded-2xl border border-[#f2d8af]/20 bg-[#100b07] px-4 py-3 text-[#f8ead6] outline-none focus:border-[#f4c98c]"
              />
              <input
                name="username"
                required
                placeholder="username"
                pattern="[a-zA-Z0-9_]{3,24}"
                className="w-full rounded-2xl border border-[#f2d8af]/20 bg-[#100b07] px-4 py-3 text-[#f8ead6] outline-none focus:border-[#f4c98c]"
              />
              <input
                name="email"
                required
                type="email"
                placeholder="email@example.com"
                className="w-full rounded-2xl border border-[#f2d8af]/20 bg-[#100b07] px-4 py-3 text-[#f8ead6] outline-none focus:border-[#f4c98c]"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  name="password"
                  required
                  type="password"
                  minLength={8}
                  placeholder="Password"
                  className="w-full rounded-2xl border border-[#f2d8af]/20 bg-[#100b07] px-4 py-3 text-[#f8ead6] outline-none focus:border-[#f4c98c]"
                />
                <input
                  name="confirmPassword"
                  required
                  type="password"
                  minLength={8}
                  placeholder="Confirm password"
                  className="w-full rounded-2xl border border-[#f2d8af]/20 bg-[#100b07] px-4 py-3 text-[#f8ead6] outline-none focus:border-[#f4c98c]"
                />
              </div>
              <select
                name="role"
                className="w-full rounded-2xl border border-[#f2d8af]/20 bg-[#100b07] px-4 py-3 text-[#f8ead6] outline-none focus:border-[#f4c98c]"
              >
                {Object.values(PlatformRole).map((role) => (
                  <option key={role} value={role}>
                    {role.charAt(0) + role.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
              <Button type="submit" className="w-full rounded-full">
                Create account
              </Button>
            </form>

            <form
              action={loginPlatformAccount}
              className="border-[#f2d8af]/16 space-y-4 rounded-3xl border bg-black/20 p-5"
            >
              <div>
                <p className="text-sm uppercase tracking-[0.16em] text-[#f4c98c]">
                  Returning
                </p>
                <h2 className="mt-1 text-3xl text-white">Log in</h2>
              </div>
              <input
                name="email"
                required
                type="email"
                placeholder="email@example.com"
                className="w-full rounded-2xl border border-[#f2d8af]/20 bg-[#100b07] px-4 py-3 text-[#f8ead6] outline-none focus:border-[#f4c98c]"
              />
              <input
                name="password"
                required
                type="password"
                placeholder="Password"
                className="w-full rounded-2xl border border-[#f2d8af]/20 bg-[#100b07] px-4 py-3 text-[#f8ead6] outline-none focus:border-[#f4c98c]"
              />
              <Button
                type="submit"
                className="w-full rounded-full border-[#f2d8af]/30 bg-transparent text-[#f8ead6] hover:bg-white/10"
              >
                Log in
              </Button>
            </form>
          </div>
        </div>
      </section>
    </PlatformShell>
  );
}
