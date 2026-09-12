import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PlatformShell } from "@/components/platform/platform-shell";
import { FriendInvitations } from "@/components/platform/friend-invitations";
import { publicFriendInvitation } from "@/lib/platform/friend-invitations";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "A Godschurches invitation",
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
    <PlatformShell user={user}>
      <section className="container-shell mx-auto max-w-2xl space-y-5 py-8">
        <h1 className="text-4xl">
          {invitation
            ? `${invitation.owner.name} invited you`
            : "This invitation is unavailable"}
        </h1>
        {invitation ? (
          <>
            <p>
              You can join and become friends with {invitation.owner.name}, or
              join without connecting. Friendship adds no church or
              private-content permissions.
            </p>
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
              <>
                <Link
                  className="gc-button"
                  href={`/platform/signup?friendInvitation=${encodeURIComponent(code)}&next=%2Fplatform%2Finvitations`}
                >
                  Create account and connect with {invitation.owner.name}
                </Link>
                <Link
                  className="gc-button gc-button-quiet"
                  href="/platform/signup"
                >
                  Join without connecting
                </Link>
                <Link
                  className="gc-button gc-button-quiet"
                  href={`/platform/login?next=${encodeURIComponent(`/platform/invite/${code}`)}`}
                >
                  Already a member? Sign in to review
                </Link>
              </>
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
          Continue without connecting
        </Link>
      </section>
    </PlatformShell>
  );
}
