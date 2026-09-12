import { InstallationHelp } from "@/components/platform/installation-help";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Church,
  CalendarDays,
  CalendarCheck,
  CircleHelp,
  FileText,
  LifeBuoy,
  Settings,
  Shield,
  UserRound
} from "lucide-react";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { accountEntryHref } from "@/lib/platform/account-entry";

export const metadata: Metadata = { title: "Menu" };

function MenuLink({
  href,
  title,
  description,
  icon: Icon
}: {
  href: string;
  title: string;
  description: string;
  icon: typeof Church;
}) {
  return (
    <li>
      <Link href={href} className="gc-menu-link">
        <Icon aria-hidden="true" />
        <span>
          <span className="gc-menu-link-title">{title}</span>
          <span className="gc-menu-link-description">{description}</span>
        </span>
        <ArrowRight aria-hidden="true" />
      </Link>
    </li>
  );
}

export default async function PlatformMenuPage() {
  const user = await getCurrentPlatformUser();
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
          {!user && (
            <div className="flex flex-wrap gap-3">
              <Link
                href={accountEntryHref("signup", "/platform/menu", "account")}
                className="gc-button"
              >
                Join Godschurches
              </Link>
              <Link
                href={accountEntryHref("login", "/platform/menu", "account")}
                className="gc-button gc-button-quiet"
              >
                Sign in
              </Link>
            </div>
          )}
          <section aria-labelledby="menu-reading">
            <h2 id="menu-reading">Read and explore</h2>
            <ul className="gc-menu-links">
              <MenuLink
                href="/platform/feed"
                title="My feed"
                description="Open a full-screen reader. Swipe left or right between posts."
                icon={BookOpen}
              />
            </ul>
          </section>
          <section aria-labelledby="menu-account">
            <h2 id="menu-account">Your account</h2>
            <ul className="gc-menu-links">
              <MenuLink
                href={
                  user
                    ? `/platform/profile/${user.username}`
                    : "/platform/profile/me"
                }
                title="Your profile"
                description="The profile you share with other members."
                icon={UserRound}
              />
              {user && (
                <MenuLink
                  href="/platform/profile/me"
                  title="Edit your profile"
                  description="Choose your name, bio and profile details."
                  icon={UserRound}
                />
              )}
              {user && (
                <>
                  <MenuLink
                    href="/platform/saved"
                    title="Your saved posts"
                    description="Organize posts into private collections."
                    icon={BookOpen}
                  />
                  <MenuLink
                    href="/platform/drafts"
                    title="Your drafts"
                    description="Review and discard your private saved drafts."
                    icon={FileText}
                  />
                </>
              )}
              <MenuLink
                href="/platform/calendars"
                title="My calendars"
                description="Your personal, church and shared calendars."
                icon={CalendarDays}
              />
              <MenuLink
                href="/platform/commitments"
                title="My commitments"
                description="Your event responses and private conflict hints."
                icon={CalendarCheck}
              />
              <MenuLink
                href="/platform/settings"
                title="Account settings"
                description="Reading, privacy, sign-in methods and account controls."
                icon={Settings}
              />
            </ul>
          </section>
          <section aria-labelledby="menu-connect">
            <h2 id="menu-connect">Church and support</h2>
            <ul className="gc-menu-links">
              <MenuLink
                href="/platform/churches"
                title="Find a church"
                description="Explore public church pages."
                icon={Church}
              />
              {user && (
                <>
                  <MenuLink
                    href="/platform/my-church"
                    title="My church"
                    description="Your church connection and available church tools."
                    icon={Church}
                  />
                  <MenuLink
                    href="/platform/my-church/sharing"
                    title="Directory sharing"
                    description="Choose what to share with your approved church."
                    icon={Shield}
                  />
                  <MenuLink
                    href="/platform/help/requests"
                    title="Your help requests"
                    description="Revisit your private requests and replies."
                    icon={LifeBuoy}
                  />
                </>
              )}
              <MenuLink
                href="/platform/help"
                title="Help and contacts"
                description="Find the right place to ask for help."
                icon={CircleHelp}
              />
            </ul>
          </section>
          <section aria-label="Installation">
            <InstallationHelp />
          </section>
          <section aria-labelledby="menu-about">
            <h2 id="menu-about">About Godschurches</h2>
            <ul className="gc-menu-links">
              <MenuLink
                href="/about"
                title="Our purpose"
                description="Faith, fellowship and everyday life."
                icon={Church}
              />
              <MenuLink
                href="/privacy"
                title="Privacy"
                description="How information is used and shared."
                icon={Shield}
              />
              <MenuLink
                href="/terms"
                title="Terms"
                description="The terms for using Godschurches."
                icon={FileText}
              />
            </ul>
          </section>
          <Link href="/platform" className="gc-button gc-button-quiet">
            Back to Home
          </Link>
        </div>
      </section>
    </PlatformShell>
  );
}
