import type { Metadata } from "next";
import { DraftWorkspaceProvider } from "@/components/platform/draft-workspace-provider";

// Keep font-relative platform controls in step with supported OS text settings.
export const metadata: Metadata = { other: { "text-scale": "scale" } };

export default function PlatformLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="platform-design" data-appearance="system">
      <DraftWorkspaceProvider>{children}</DraftWorkspaceProvider>
    </div>
  );
}
