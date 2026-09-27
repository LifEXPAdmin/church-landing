import type { Metadata } from "next";
import { MediaEditor } from "@/components/platform/media-catalog-editor";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Media",
  robots: { index: false, follow: false }
};
export default async function Page() {
  const user = await getCurrentPlatformUser(),
    owner = user?.id ?? null;
  return (
    <PlatformShell user={user}>
      <div className="mx-auto max-w-4xl space-y-6 p-[12px] sm:p-6">
        <MediaEditor owner={owner} />
      </div>
    </PlatformShell>
  );
}
