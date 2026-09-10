import type { Metadata } from "next";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
import { PlatformShell } from "@/components/platform/platform-shell";
import { ProfileForm } from "@/components/platform/profile-form";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const metadata: Metadata = {
  title: { absolute: "Edit your Godschurches profile" },
  description: "Choose what to share with other Godschurches members."
};
export default async function EditProfilePage() {
  const user = await getCurrentPlatformUser();
  if (!user)
    return (
      <PlatformShell user={null}>
        <GuestAccountPrompt next="/platform/profile/me" reason="profile" />
      </PlatformShell>
    );
  const { name, bio, location, website, interests } = user;
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-8 sm:py-10">
        <ProfileForm profile={{ name, bio, location, website, interests }} />
      </section>
    </PlatformShell>
  );
}
