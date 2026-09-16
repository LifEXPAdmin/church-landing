import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PlatformShell } from "@/components/platform/platform-shell";
import { PrivilegedAuthenticator } from "@/components/platform/privileged-authenticator";
import { getCurrentPlatformUser, PLATFORM_SESSION_COOKIE } from "@/lib/platform/session";
import { privateCookies } from "@/lib/platform/private-cookies";
import { readPrivilegedAuthentication } from "@/lib/platform/privileged-auth";
import { accountEntryHref } from "@/lib/platform/account-entry";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your authenticator", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function AuthenticatorPage({ searchParams }: { searchParams: Promise<{ purpose?: string }> }) {
  const user = await getCurrentPlatformUser();
  const query = await searchParams;
  const data = user ? await readPrivilegedAuthentication(prisma, (await privateCookies()).get(PLATFORM_SESSION_COOKIE)?.value) : null;
  return <PlatformShell user={user} signInReturnTo="/platform/account/authenticator">
    <section className="container-shell py-10"><div className="mx-auto max-w-2xl space-y-5">
      {data ? <PrivilegedAuthenticator key={data.ownerId} data={data} purpose={query.purpose} />
        : <><h1 className="text-3xl font-semibold">Your authenticator</h1><p>Sign in to review your own account security.</p><Link className="gc-button" href={accountEntryHref("login", "/platform/account/authenticator", "settings")}>Sign in</Link></>}
    </div></section>
  </PlatformShell>;
}
