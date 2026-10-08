import type { Metadata } from "next";
import { PlatformShell } from "@/components/platform/platform-shell";
import { VolunteerDutyTemplates } from "@/components/platform/volunteer-duty-templates";
import { getCurrentPlatformUser } from "@/lib/platform/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ordinary duty templates",
  robots: { index: false, follow: false }
};
export default async function Page() {
  const user = await getCurrentPlatformUser();
  return (
    <PlatformShell user={user} signInReturnTo="/platform/serve/templates">
      <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-8 max-[359px]:px-0">
        <VolunteerDutyTemplates owner={user?.id ?? null} />
      </div>
    </PlatformShell>
  );
}
