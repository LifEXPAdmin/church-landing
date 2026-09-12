import { LoadedReleaseProvider } from "@/components/platform/loaded-release";
import { releaseMetadata } from "@/lib/platform/release-content";
import { UpdateNotice } from "@/components/platform/update-notice";
import { publicReleaseId } from "@/lib/platform/install-policy";
import { InstallationProvider } from "@/components/platform/installation-help";
import type { Metadata } from "next";
import { DraftWorkspaceProvider } from "@/components/platform/draft-workspace-provider";

// Keep font-relative platform controls in step with supported OS text settings.
export const metadata: Metadata = { other: { "text-scale": "scale" } };

export default function PlatformLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const release = publicReleaseId(process.env.VERCEL_GIT_COMMIT_SHA);
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
            <UpdateNotice release={release} />
            {children}
          </LoadedReleaseProvider>
        </DraftWorkspaceProvider>
      </InstallationProvider>
    </div>
  );
}
