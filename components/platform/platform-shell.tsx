import { LoadedVersion } from "./loaded-release";
import Link from "next/link";
import { publicReleaseId } from "@/lib/platform/install-policy";
import { privateCookies } from "@/lib/platform/private-cookies";
import { ReadingProvider, AppearanceSelect } from "./reading-preferences";
import {
  parseReadingPreferences,
  preferenceCookie,
  defaultReadingPreferences
} from "@/lib/platform/reading-preferences";
import type { PlatformUser } from "@prisma/client";
import { Church, LogOut, Settings } from "lucide-react";
import { logoutPlatformAccount } from "@/app/platform/actions";
import { PortalNavigation } from "@/components/platform/portal-navigation";

interface PlatformShellProps {
  user: Pick<PlatformUser, "name" | "username"> | null;
  children: React.ReactNode;
  reviewerNavigation?: { href: string; label: string }[];
}

export async function PlatformShell({
  user,
  children,
  reviewerNavigation = []
}: PlatformShellProps) {
  // Preserve the existing browser-restored preference defaults in development.
  // Production cookie reads use the shared private serialization boundary.
  const initial =
    process.env.NODE_ENV === "production"
      ? parseReadingPreferences(
          (await privateCookies()).get(preferenceCookie)?.value
        )
      : defaultReadingPreferences;
  return (
    <ReadingProvider
      initial={initial}
      release={publicReleaseId(process.env.VERCEL_GIT_COMMIT_SHA)}
    >
      <div className="gc-shell">
        <a href="#platform-content" className="gc-skip">
          Skip to content
        </a>
        <header className="gc-topbar">
          <Link href="/platform" className="wordmark gc-brand">
            <Church aria-hidden="true" />
            Godschurches
          </Link>
          <span className="gc-tagline">Faith. Fellowship. Everyday life.</span>
          <nav aria-label="Account and website" className="gc-utilities">
            {user ? (
              <>
                <Link href="/platform/settings" className="gc-utility">
                  <Settings aria-hidden="true" />
                  <span>Settings</span>
                </Link>
                <form action={logoutPlatformAccount}>
                  <button type="submit" className="gc-utility">
                    <LogOut aria-hidden="true" />
                    <span>Log out</span>
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/platform/login"
                className="gc-button gc-button-quiet"
              >
                Sign in
              </Link>
            )}
          </nav>
        </header>
        <div className="gc-workspace">
          <PortalNavigation
            username={user?.username}
            reviewerNavigation={reviewerNavigation}
          />
          <main id="platform-content" tabIndex={-1} className="gc-main">
            {children}
          </main>
        </div>
        <footer className="gc-platform-footer">
          <AppearanceSelect />
          <LoadedVersion />
          <Link href="/platform/features">Explore features</Link>
          <Link href="/platform/releases">What’s new</Link>
          <span>Built on faith. Made for connection.</span>
          <Link href="/about">About Godschurches</Link>
          <Link href="/help">Help</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </footer>
      </div>
    </ReadingProvider>
  );
}
