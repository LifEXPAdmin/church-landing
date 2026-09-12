import type { Metadata } from "next";
import Link from "next/link";
import { PlatformShell } from "@/components/platform/platform-shell";
import { PublicShareControls } from "@/components/platform/public-share-controls";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { accountConfig } from "@/lib/platform/account-config";
import { accountEntryHref } from "@/lib/platform/account-entry";
export const metadata: Metadata = {
  title: "Share Godschurches",
  description: "Open the community, create an account and find your church."
};
export const dynamic = "force-dynamic";
export default async function SharePage() {
  const user = await getCurrentPlatformUser();
  const url = new URL("/platform", accountConfig().origin).href;
  return (
    <PlatformShell user={user}>
      <section className="container-shell mx-auto max-w-2xl space-y-5 py-10">
        <p className="gc-eyebrow">Welcome to the community</p>
        <h1 className="text-4xl">Share Godschurches</h1>
        <p>
          Scan the QR to read public conversations, create an account and find
          your church. Joining a church follows its normal approval process.
        </p>
        <PublicShareControls kind="site" id="godschurches" siteUrl={url} />
        <div className="flex flex-wrap gap-3">
          {!user && (
            <>
              <Link
                className="gc-button"
                href={accountEntryHref(
                  "signup",
                  "/platform/churches",
                  "connection"
                )}
              >
                Create account
              </Link>
              <Link
                className="gc-button gc-button-quiet"
                href={accountEntryHref(
                  "login",
                  "/platform/churches",
                  "connection"
                )}
              >
                Sign in
              </Link>
            </>
          )}
          <Link className="gc-button gc-button-quiet" href="/platform/churches">
            Find your church
          </Link>
          <Link className="gc-button gc-button-quiet" href="/platform/menu">
            Installation help in Menu
          </Link>
        </div>
        <p>
          No app-store download is required. Use your browser or the
          installation help available for your device.
        </p>
      </section>
    </PlatformShell>
  );
}
