import { PlatformShell } from "@/components/platform/platform-shell";
import { FeatureGuide } from "@/components/platform/feature-guide";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { photoLibraryEnabled } from "@/lib/platform/personal-photo-policy";
import { imagesAvailable } from "@/lib/platform/media-storage";
export const metadata = { title: "Explore features" };
export default async function Page() {
  return (
    <PlatformShell user={await getCurrentPlatformUser()}>
      <section className="container-shell max-w-3xl space-y-6 py-8">
        <h1 className="text-4xl">Explore features</h1>
        <p>
          A guide to current capabilities, including features from earlier
          releases. Access depends on your account and church permissions.
        </p>
        <FeatureGuide
          imagesEnabled={imagesAvailable()}
          photoLibraryEnabled={photoLibraryEnabled()}
        />
      </section>
    </PlatformShell>
  );
}
