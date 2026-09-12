import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { publicFriendInvitation } from "@/lib/platform/friend-invitations";
import type { Metadata } from "next";
import { AccountAccess } from "@/components/platform/account-access";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { safeAccountReturn, accountReason } from "@/lib/platform/account-entry";
import { googleAvailable } from "@/lib/platform/google-availability";
import { accountDeliveryAvailable } from "@/lib/platform/account-availability";
export const metadata: Metadata = {
  title: { absolute: "Create a Godschurches account" },
  description: "Create your account and start connecting in faith.",
  referrer: "no-referrer",
  robots: { index: false, follow: false }
};
export default async function PlatformSignupPage({
  searchParams
}: {
  searchParams: Promise<{
    next?: string;
    reason?: string;
    friendInvitation?: string;
  }>;
}) {
  const { next, reason, friendInvitation } = await searchParams;
  const invite = await publicFriendInvitation(prisma, friendInvitation);
  const user = await getCurrentPlatformUser();
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-8 sm:py-10">
        {user && friendInvitation ? (
          <Link
            className="gc-button"
            href={`/platform/invite/${encodeURIComponent(friendInvitation)}`}
          >
            Review invitation with your signed-in account
          </Link>
        ) : (
          <AccountAccess
            invitation={
              invite && friendInvitation
                ? { code: friendInvitation, name: invite.owner.name }
                : undefined
            }
            recoveryAvailable={accountDeliveryAvailable()}
            googleAvailable={googleAvailable() && !user}
            initialView="register"
            returnTo={safeAccountReturn(next)}
            reason={reason ? accountReason(reason) : undefined}
          />
        )}
        {friendInvitation && !invite && (
          <p>
            This invitation is unavailable. You can create an account without
            connecting.
          </p>
        )}
      </section>
    </PlatformShell>
  );
}
