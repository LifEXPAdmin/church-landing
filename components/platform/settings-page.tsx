import { redirect } from "next/navigation";
import { PlatformShell } from "./platform-shell";
import { SettingsWorkspace } from "./settings-workspace";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { accountEntryHref } from "@/lib/platform/account-entry";
import { RetainedReactionSettings } from "./reaction-preferences";

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
  if (!user) {
    if (folder === "display" && setting === "reading")
      return (
        <RetainedReactionSettings key={next} owner={null}>
          <section className="container-shell space-y-3 py-8">
            <h1>Reading preferences</h1>
            <p>Sign in to review your display and contribution choices.</p>
            <a
              className="gc-button"
              href={accountEntryHref("join", next, "settings")}
            >
              Sign in or join
            </a>
          </section>
        </RetainedReactionSettings>
      );
    redirect(accountEntryHref("join", next, "settings"));
  }
  const frame = (
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
  return folder === "display" && setting === "reading" ? (
    <RetainedReactionSettings key={next} owner={user.id}>
      {frame}
    </RetainedReactionSettings>
  ) : (
    frame
  );
}
