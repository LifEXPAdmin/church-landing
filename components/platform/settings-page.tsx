import { redirect } from "next/navigation";
import { PlatformShell } from "./platform-shell";
import { SettingsWorkspace } from "./settings-workspace";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { accountEntryHref } from "@/lib/platform/account-entry";

export async function SettingsPage({
  folder,
  setting
}: {
  folder?: string;
  setting?: string;
}) {
  const user = await getCurrentPlatformUser();
  const next =
    "/platform/settings" +
    (folder ? "/" + folder : "") +
    (setting ? "/" + setting : "");
  if (!user) redirect(accountEntryHref("join", next, "settings"));
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-8 sm:py-10">
        <SettingsWorkspace
          key={next + ":" + user.id}
          owner={user.id}
          folder={folder}
          setting={setting}
        />
      </section>
    </PlatformShell>
  );
}
