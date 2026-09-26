import { LoadedVersion } from "@/components/platform/loaded-release";
import {
  InstallationBanner,
  InstallationHelp
} from "@/components/platform/installation-help";
import type { Metadata } from "next";
import Link from "next/link";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { accountEntryHref } from "@/lib/platform/account-entry";
import { randomUUID } from "node:crypto";
import { MenuLink } from "@/components/platform/menu-link";
import { MenuPrivateWorkspace } from "@/components/platform/menu-private-workspace";
import {
  navigationRegistry,
  navigationItem,
  menuNavigation,
  aboutNavigation
} from "@/lib/platform/navigation-registry";

export const metadata: Metadata = { title: "Menu" };
export default async function PlatformMenuPage() {
  const user = await getCurrentPlatformUser();
  const context = { username: user?.username };
  const groups = menuNavigation(context);
  return (
    <PlatformShell user={user}>
      <section className="container-shell">
        <div className="gc-menu-page">
          <header>
            <p className="gc-eyebrow">Your way around</p>
            <h1>Menu</h1>
            <p className="mt-3 text-gc-muted">
              {user
                ? "Your profile, account and places to connect."
                : "Look around at your own pace. Join when you want to take part."}
            </p>
          </header>
          <ul className="gc-menu-links" aria-label="Quick sharing">
            <MenuLink item={navigationItem("qr", context)} />
          </ul>
          <MenuPrivateWorkspace
            key={user?.id ?? "guest"}
            owner={user?.id}
            refreshKey={randomUUID()}
          >
            <InstallationBanner />
            {!user && (
              <div className="flex flex-wrap gap-3">
                <Link
                  href={accountEntryHref(
                    "signup",
                    navigationRegistry.menu.href,
                    "account"
                  )}
                  className="gc-button"
                >
                  Join God’s Churches
                </Link>
                <Link
                  href={accountEntryHref(
                    "login",
                    navigationRegistry.menu.href,
                    "account"
                  )}
                  className="gc-button gc-button-quiet"
                >
                  Sign in
                </Link>
              </div>
            )}
            {groups.map((group) => (
              <section key={group.id} aria-labelledby={"menu-" + group.id}>
                <h2 id={"menu-" + group.id}>{group.title}</h2>
                <ul className="gc-menu-links">
                  {group.items.map((item) => (
                    <MenuLink key={item.id} item={item} />
                  ))}
                </ul>
              </section>
            ))}
            <section aria-label="Installation">
              <InstallationHelp />
              <InstallationHelp bookmark />
            </section>
          </MenuPrivateWorkspace>
          <section aria-labelledby="menu-about">
            <h2 id="menu-about">About God’s Churches</h2>
            <ul className="gc-menu-links">
              {aboutNavigation.map((item) => (
                <MenuLink key={item.id} item={item} />
              ))}
            </ul>
          </section>
          <Link
            href={navigationRegistry.home.href}
            className="gc-button gc-button-quiet"
          >
            Back to Home
          </Link>
        </div>
        <LoadedVersion />
      </section>
    </PlatformShell>
  );
}
