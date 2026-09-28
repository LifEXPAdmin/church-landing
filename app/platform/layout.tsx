import { LoadedReleaseProvider } from "@/components/platform/loaded-release";
import { releaseMetadata } from "@/lib/platform/release-content";
import { UpdateNotice } from "@/components/platform/update-notice";
import { publicReleaseId } from "@/lib/platform/install-policy";
import { InstallationProvider } from "@/components/platform/installation-help";
import type { Metadata } from "next";
import { DraftWorkspaceProvider } from "@/components/platform/draft-workspace-provider";
import { SessionActivity } from "@/components/platform/session-activity";
import { getCurrentPlatformUser } from "@/lib/platform/session";

// Keep font-relative platform controls in step with supported OS text settings.
export const metadata: Metadata = {
  other: { "text-scale": "scale" },
  robots: { index: false, follow: false }
};

export default async function PlatformLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const release = publicReleaseId(process.env.VERCEL_GIT_COMMIT_SHA);
  const owner = (await getCurrentPlatformUser())?.id ?? null;
  return (
    <div
      className="platform-design"
      data-appearance="system"
      data-release={release ?? ""}
    >
      <InstallationProvider>
        <DraftWorkspaceProvider>
          <LoadedReleaseProvider
            value={{
              build: release,
              id: releaseMetadata(release)?.id ?? null,
              version: releaseMetadata(release)?.version ?? null
            }}
          >
            <SessionActivity owner={owner} />
            <UpdateNotice release={release}>{children}</UpdateNotice>
          </LoadedReleaseProvider>
        </DraftWorkspaceProvider>
      </InstallationProvider>
    </div>
  );
}
