import type { Metadata } from "next";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
import { PlatformShell } from "@/components/platform/platform-shell";
import { ProfileEditor } from "@/components/platform/profile-editor";
import { readProfileEditor } from "@/lib/platform/profile-session";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { accountReasons } from "@/lib/platform/account-entry";
import { PortalError } from "@/lib/platform/portal";
export async function generateMetadata(): Promise<Metadata> {
  const user = await getCurrentPlatformUser();
  return {
    title: {
      absolute: user ? "Edit your Godschurches profile" : accountReasons.profile
    },
    description: user
      ? "Choose what to share with other Godschurches members."
      : "Sign in to view and edit your Godschurches profile.",
    robots: { index: false, follow: false }
  };
}
export default async function EditProfilePage() {
  const user = await getCurrentPlatformUser();
  if (!user)
    return (
      <PlatformShell user={null}>
        <GuestAccountPrompt next="/platform/profile/me" reason="profile" />
      </PlatformShell>
    );
  let profile;
  try {
    profile = await readProfileEditor();
  } catch (error) {
    if (error instanceof PortalError && error.status === 401)
      return (
        <PlatformShell user={null}>
          <GuestAccountPrompt next="/platform/profile/me" reason="profile" />
        </PlatformShell>
      );
    throw error;
  }
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-8 sm:py-10">
        <ProfileEditor profile={profile} />
      </section>
    </PlatformShell>
  );
}
