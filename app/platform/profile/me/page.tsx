import { redirect } from "next/navigation";
import { photoLibraryEnabled } from "@/lib/platform/personal-photo-policy";
import type { Metadata } from "next";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
import { PlatformShell } from "@/components/platform/platform-shell";
import { ProfileEditor } from "@/components/platform/profile-editor";
import { readProfileEditor } from "@/lib/platform/profile-session";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { accountReasons } from "@/lib/platform/account-entry";
import { PortalError } from "@/lib/platform/portal";
import { createHash } from "node:crypto";
import { PrivateSnapshotGuard } from "@/components/platform/private-snapshot-guard";
export async function generateMetadata(): Promise<Metadata> {
  const user = await getCurrentPlatformUser();
  return {
    title: {
      absolute: user
        ? "Edit your God’s Churches profile"
        : accountReasons.profile
    },
    description: user
      ? "Choose what to share with other Godschurches members."
      : "Sign in to view and edit your Godschurches profile.",
    robots: { index: false, follow: false }
  };
}
export default async function EditProfilePage({
  searchParams
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentPlatformUser();
  const photos = (await searchParams).tab === "photos" && photoLibraryEnabled();
  if (user && photos)
    redirect(
      `/platform/profile/${encodeURIComponent(user.username)}?tab=photos`
    );
  if (!user)
    return (
      <PlatformShell user={null}>
        <GuestAccountPrompt
          next={
            photos ? "/platform/profile/me?tab=photos" : "/platform/profile/me"
          }
          reason="profile"
        />
      </PlatformShell>
    );
  let profile;
  try {
    profile = await readProfileEditor();
  } catch (error) {
    if (error instanceof PortalError && error.status === 401)
      return (
        <PlatformShell user={null}>
          <GuestAccountPrompt
            next={
              photos
                ? "/platform/profile/me?tab=photos"
                : "/platform/profile/me"
            }
            reason="profile"
          />
        </PlatformShell>
      );
    throw error;
  }
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-8 sm:py-10">
        <PrivateSnapshotGuard
          owner={profile.id}
          url="/api/platform/profile?view=identity"
          checksum={createHash("sha256")
            .update(JSON.stringify({ id: profile.id }))
            .digest("hex")}
          label="account"
        >
          <ProfileEditor profile={profile} />
        </PrivateSnapshotGuard>
      </section>
    </PlatformShell>
  );
}
