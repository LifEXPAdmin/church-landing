import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutPlatformAccount } from "@/app/platform/actions";
import { AccountForm } from "@/components/platform/account-form";
import { PlatformShell } from "@/components/platform/platform-shell";
import { Button } from "@/components/ui/button";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { ReadingSettings } from "@/components/platform/reading-preferences";
import { AccountSessions } from "@/components/platform/account-sessions";
import { AccountExport } from "@/components/platform/account-export";
import { AccountLifecycle } from "@/components/platform/account-lifecycle";
import { AccountEmailChange } from "@/components/platform/account-email-change";
import { accountConfig } from "@/lib/platform/account-config";
export const metadata: Metadata = { title: "Account settings" };
export default async function PlatformSettingsPage() {
  const user = await getCurrentPlatformUser();
  if (!user) redirect("/platform/login");
  let emailAvailable = false;
  try {
    emailAvailable = accountConfig().delivery !== "disabled";
  } catch {
    /* Unconfigured delivery stays unavailable. */
  }
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-10">
        <div className="mx-auto max-w-2xl space-y-6">
          <h1 className="text-5xl text-gc-text">Account settings</h1>
          <ReadingSettings />
          <div className="gc-settings">
            <h2>Privacy and sharing</h2>
            <p className="text-gc-muted">
              Your public profile, private account email, and church directory
              choices are separate. You choose whether to share directory
              details with your approved church.
            </p>
            <Link
              href="/platform/profile/me"
              className="inline-flex min-h-11 items-center text-gc-action underline"
            >
              Edit your public profile
            </Link>
            <Link
              href="/platform/my-church/sharing"
              className="inline-flex min-h-11 items-center text-gc-action underline"
            >
              Manage church directory sharing
            </Link>
          </div>
          <AccountSessions />
          <AccountEmailChange available={emailAvailable} />
          <AccountExport />
          <AccountLifecycle />
          <div className="rounded-xl border border-gc-divider bg-gc-surface p-6">
            <AccountForm operation="change-password" />
          </div>
          <div className="gc-settings">
            <h2>Help and updates</h2>
            <p className="text-gc-muted">
              In-app notification preferences are not available yet. Waitlist
              emails are managed separately through the unsubscribe link in each
              email.
            </p>
            <Link
              href="/platform/help"
              className="inline-flex min-h-11 items-center text-gc-action underline"
            >
              Find help and contacts
            </Link>
          </div>
          <div className="rounded-xl border border-gc-divider bg-gc-surface p-6">
            <h2 className="text-3xl text-gc-text">Email verification</h2>
            <p className="my-3 text-gc-muted">
              {user.emailVerifiedAt
                ? "Your account email has been verified."
                : "Your account email has not been verified."}
            </p>
            {!user.emailVerifiedAt && (
              <Link
                href="/platform/account/recover"
                className="text-gc-accent underline"
              >
                Email verification options
              </Link>
            )}
          </div>
          <form action={logoutPlatformAccount}>
            <Button type="submit" className="rounded-full">
              Log out on this device
            </Button>
          </form>
        </div>
      </section>
    </PlatformShell>
  );
}
