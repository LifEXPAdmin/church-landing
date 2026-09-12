import type { Metadata } from "next";
import { PlatformShell } from "@/components/platform/platform-shell";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
import { ContactWorkspace } from "@/components/platform/contact-workspace";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { readerId } from "@/lib/platform/reader-navigation";
export const metadata: Metadata = {
  title: "Private contact requests",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams
}: {
  searchParams: Promise<{
    recipientId?: string;
    id?: string;
    view?: string;
    after?: string;
  }>;
}) {
  const user = await getCurrentPlatformUser(),
    q = await searchParams;
  const recipientId = readerId(q.recipientId),
    id = readerId(q.id),
    after = readerId(q.after);
  const view = recipientId
    ? "compose"
    : id
      ? "receipt"
      : q.view === "sent"
        ? "sent"
        : "received";
  const params = new URLSearchParams(
    recipientId
      ? { recipientId }
      : id
        ? { id }
        : { view, ...(after ? { after } : {}) }
  );
  return (
    <PlatformShell user={user}>
      {user ? (
        <div className="container-shell py-10">
          <div className="mx-auto max-w-2xl">
            <ContactWorkspace
              key={`${user.id}-${view}-${id ?? recipientId ?? after ?? "first"}`}
              owner={user.id}
              view={view}
              recipientId={recipientId}
              id={recipientId ? undefined : id}
              after={recipientId || id ? undefined : after}
            />
          </div>
        </div>
      ) : (
        <GuestAccountPrompt
          next={`/platform/messages/requests?${params}`}
          reason="account"
        />
      )}
    </PlatformShell>
  );
}
