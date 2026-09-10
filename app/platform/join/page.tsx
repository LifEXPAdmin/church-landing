import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlatformShell } from "@/components/platform/platform-shell";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
import { safeAccountReturn } from "@/lib/platform/account-entry";
import { getCurrentPlatformUser } from "@/lib/platform/session";

export const metadata: Metadata = {
  title: "Join the conversation",
  robots: { index: false, follow: false }
};
export default async function JoinPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const next = safeAccountReturn(params.next);
  const user = await getCurrentPlatformUser();
  if (user) redirect(next);
  return (
    <PlatformShell user={null}>
      <GuestAccountPrompt next={next} reason={params.reason} />
    </PlatformShell>
  );
}
