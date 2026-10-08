import { redirect } from "next/navigation";
import { PlatformShell } from "./platform-shell";
import { SettingsWorkspace } from "./settings-workspace";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { accountEntryHref } from "@/lib/platform/account-entry";
import { RetainedSettingsFrame } from "./retained-settings-frame";

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
  const deactivation = folder === "data" && setting === "deactivate";
  if (!user) {
    if (deactivation)
      return (
        <RetainedSettingsFrame
          key={next}
          owner={null}
          returnTo={next}
          reactivation={deactivation}
        >
          <section className="container-shell space-y-3 py-8">
            <h1>Deactivate account</h1>
            <p>Sign in to review deactivation for your account.</p>
            <a
              className="gc-button"
              href={accountEntryHref("join", next, "settings")}
            >
              Sign in or join
            </a>
          </section>
        </RetainedSettingsFrame>
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
  return deactivation ? (
    <RetainedSettingsFrame
      key={next}
      owner={user.id}
      returnTo={next}
      reactivation={deactivation}
    >
      {frame}
    </RetainedSettingsFrame>
  ) : (
    frame
  );
}
