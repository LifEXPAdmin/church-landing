import type { Metadata } from "next";
import { PlatformShell } from "@/components/platform/platform-shell";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
import { FounderAnnouncements } from "@/components/platform/founder-announcements";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const metadata: Metadata = {
  title: "Founder announcements",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await getCurrentPlatformUser();
  return (
    <PlatformShell user={user}>
      {user ? (
        <div className="container-shell py-6">
          <FounderAnnouncements key={user.id} owner={user.id} />
        </div>
      ) : (
        <GuestAccountPrompt
          next="/platform/messages/announcements"
          reason="account"
        />
      )}
    </PlatformShell>
  );
}
