import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PlatformShell } from "@/components/platform/platform-shell";
import { FriendInvitations } from "@/components/platform/friend-invitations";
import { AccountAccess } from "@/components/platform/account-access";
import { accountDeliveryAvailable } from "@/lib/platform/account-availability";
import { publicFriendInvitation } from "@/lib/platform/friend-invitations";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "A God’s Churches invitation",
  description: "Review an invitation to connect. Joining is your choice.",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};
export default async function Page({
  params
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const [user, invitation] = await Promise.all([
    getCurrentPlatformUser(),
    publicFriendInvitation(prisma, code)
  ]);
  return (
    <PlatformShell
      user={user}
      signInReturnTo={invitation ? `/platform/invite/${code}` : undefined}
    >
      <section className="container-shell mx-auto max-w-2xl space-y-5 py-8">
        {(user || !invitation) && (
          <h1 className="text-4xl">
            {invitation
              ? user
                ? "Your invitation and connection"
                : `${invitation.owner.name} invited you`
              : "This invitation is unavailable"}
          </h1>
        )}
        {invitation ? (
          <>
            {user ? (
              <FriendInvitations
                accountId={user.id}
                invitation={{
                  code,
                  name: invitation.owner.name,
                  username: invitation.owner.username,
                  inviterId: invitation.ownerId
                }}
              />
            ) : (
              <AccountAccess
                initialView="register"
                invitation={{ code, name: invitation.owner.name }}
                returnTo="/platform/invitations"
                signInReturnTo={`/platform/invite/${code}`}
                recoveryAvailable={accountDeliveryAvailable()}
              />
            )}
          </>
        ) : (
          <>
            <p>
              The code may have expired, been replaced or been revoked. You can
              still join Godschurches normally.
            </p>
            <Link className="gc-button" href="/platform/signup">
              Create account
            </Link>
          </>
        )}
        <Link className="gc-button gc-button-quiet" href="/platform">
          Browse the platform
        </Link>
      </section>
    </PlatformShell>
  );
}
