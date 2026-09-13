import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { privateCookies } from "@/lib/platform/private-cookies";
import {
  getCurrentPlatformUser,
  PLATFORM_SESSION_COOKIE
} from "@/lib/platform/session";
import { openNotification } from "@/lib/platform/notification-outbox";
import { PlatformShell } from "@/components/platform/platform-shell";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Open notification",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};
export default async function NotificationPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    user = await getCurrentPlatformUser();
  let href: string | null = null;
  if (user)
    try {
      href = (
        await openNotification(
          prisma,
          (await privateCookies()).get(PLATFORM_SESSION_COOKIE)?.value,
          id,
          false
        )
      ).href;
    } catch {
      /* Generic private boundary; never expose another account's source. */
    }
  if (href) redirect(href);
  return (
    <PlatformShell user={user}>
      {user ? (
        <section className="container-shell py-8">
          <h1>This notification is no longer available</h1>
          <p>The item or your access may have changed.</p>
          <Link className="gc-button" href="/platform/messages">
            Open your messages
          </Link>
        </section>
      ) : (
        <GuestAccountPrompt
          reason="account"
          next={`/platform/notifications/${id}`}
        />
      )}
    </PlatformShell>
  );
}
