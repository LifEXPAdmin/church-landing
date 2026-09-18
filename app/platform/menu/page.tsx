import { LoadedVersion } from "@/components/platform/loaded-release";
import {
  InstallationBanner,
  InstallationHelp
} from "@/components/platform/installation-help";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Bell,
  Church,
  CalendarDays,
  CalendarCheck,
  CircleHelp,
  FileText,
  LifeBuoy,
  HandHeart,
  QrCode,
  Settings,
  Shield,
  UserRound,
  Home,
  Search,
  MessageCircle,
  Menu
} from "lucide-react";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { accountEntryHref } from "@/lib/platform/account-entry";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { privateCookies } from "@/lib/platform/private-cookies";
import { PLATFORM_SESSION_COOKIE } from "@/lib/platform/session";
import {
  readMenuShortcuts,
  type MenuShortcutsState
} from "@/lib/platform/menu-shortcuts";
import { PrivateSnapshotGuard } from "@/components/platform/private-snapshot-guard";
import { MenuShortcutsEditor } from "@/components/platform/menu-shortcuts";
import {
  navigationRegistry,
  navigationItem,
  menuNavigation,
  administrationNavigation,
  aboutNavigation,
  type NavigationIcon,
  type NavigationItem
} from "@/lib/platform/navigation-registry";

export const metadata: Metadata = { title: "Menu" };
const icons: Record<NavigationIcon, typeof Church> = {
  home: Home,
  church: Church,
  search: Search,
  messages: MessageCircle,
  menu: Menu,
  book: BookOpen,
  bell: Bell,
  calendar: CalendarDays,
  calendarCheck: CalendarCheck,
  circleHelp: CircleHelp,
  file: FileText,
  help: LifeBuoy,
  handHeart: HandHeart,
  qr: QrCode,
  settings: Settings,
  shield: Shield,
  person: UserRound
};

function MenuLink({ item }: { item: NavigationItem }) {
  const Icon = icons[item.icon];
  return (
    <li>
      <Link href={item.href} prefetch={item.prefetch} className="gc-menu-link">
        <Icon aria-hidden="true" />
        <span>
          <span className="gc-menu-link-title">{item.title}</span>
          <span className="gc-menu-link-description">{item.description}</span>
        </span>
        <ArrowRight aria-hidden="true" />
      </Link>
    </li>
  );
}

export default async function PlatformMenuPage() {
  const user = await getCurrentPlatformUser();
  let shortcuts: MenuShortcutsState | null = null;
  if (user && process.env.NODE_ENV === "production") {
    try {
      const cookies = await privateCookies();
      const state = await readMenuShortcuts(
        prisma,
        cookies.get(PLATFORM_SESSION_COOKIE)?.value
      );
      if (state.ownerId === user.id) shortcuts = state;
    } catch {
      /* Optional private choices fail closed; the rest of Menu remains usable. */
    }
  }
  const context = {
    username: user?.username,
    adminAvailable: !!shortcuts?.choices.some((item) => item.id === "admin")
  };
  const groups = menuNavigation(context);
  const administration = administrationNavigation(context);
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
          {user && (
            <section aria-labelledby="menu-shortcuts-title">
              <h2 id="menu-shortcuts-title">Your shortcuts</h2>
              {shortcuts ? (
                <PrivateSnapshotGuard
                  owner={shortcuts.ownerId}
                  url="/api/platform/menu-shortcuts"
                  checksum={createHash("sha256")
                    .update(JSON.stringify(shortcuts))
                    .digest("hex")}
                  label="Menu shortcuts"
                >
                  {shortcuts.ids.length ? (
                    <ul
                      className="gc-menu-links"
                      aria-label="Saved Menu shortcuts"
                    >
                      {shortcuts.ids.map((id) => (
                        <MenuLink
                          key={id}
                          item={
                            shortcuts.choices.find((item) => item.id === id)!
                          }
                        />
                      ))}
                    </ul>
                  ) : (
                    <p>
                      No shortcuts selected. Choose the places you use most.
                    </p>
                  )}
                  <MenuShortcutsEditor
                    key={`${shortcuts.ownerId}:${shortcuts.version}`}
                    initial={shortcuts}
                  />
                </PrivateSnapshotGuard>
              ) : (
                <p role="status">
                  Your shortcuts could not be loaded. Reconnect and reload Menu
                  to try again.
                </p>
              )}
            </section>
          )}
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
          {administration.length > 0 && (
            <section aria-labelledby="menu-admin">
              <h2 id="menu-admin">Admin</h2>
              <ul className="gc-menu-links">
                {administration.map((item) => (
                  <MenuLink key={item.id} item={item} />
                ))}
              </ul>
            </section>
          )}
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
