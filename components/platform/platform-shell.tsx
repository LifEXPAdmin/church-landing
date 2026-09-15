import { PushSessionBoundary } from "./push-session-boundary";
import { LoadedVersion } from "./loaded-release";
import { MissionSignature } from "@/components/layout/site-footer";
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
import { accountConfig } from "@/lib/platform/account-config";
import {
  confirmedSignup,
  signupCompletionCookieName
} from "@/lib/platform/signup-completion";
import { PostSignupHelp } from "./installation-help";
import { accountEntryHref } from "@/lib/platform/account-entry";
import { PrayerWorkspaceProvider } from "./prayer-workspace";
import { MeasurementForeground } from "./measurement-foreground";
import { FeedbackPrompt } from "./feedback-prompt";

interface PlatformShellProps {
  user:
    | (Pick<PlatformUser, "name" | "username"> &
        Partial<Pick<PlatformUser, "id" | "emailVerifiedAt">>)
    | null;
  children: React.ReactNode;
  reviewerNavigation?: { href: string; label: string }[];
  signInReturnTo?: string;
}

export async function PlatformShell({
  user,
  children,
  reviewerNavigation = [],
  signInReturnTo
}: PlatformShellProps) {
  // Preserve the existing browser-restored preference defaults in development.
  // Production cookie reads use the shared private serialization boundary.
  // Reduced visitor-preview identities deliberately carry no account ID. Avoid
  // awaiting the shared cookie promise there: development diagnostics can attach
  // earlier session-reader results to it even though the cookie value is redacted.
  const cookieStore =
    process.env.NODE_ENV === "production" || user?.id
      ? await privateCookies()
      : null;
  const initial =
    process.env.NODE_ENV === "production"
      ? parseReadingPreferences(cookieStore?.get(preferenceCookie)?.value)
      : defaultReadingPreferences;
  let newAccount = false;
  if (user?.id) {
    try {
      const config = accountConfig();
      const proofs = cookieStore!.getAll(
        signupCompletionCookieName(config.secureCookie)
      );
      newAccount =
        proofs.length === 1 &&
        confirmedSignup(proofs[0].value, user.id, config.rateSecret);
    } catch {
      // Optional setup help must not interrupt an existing account's navigation.
    }
  }
  return (
    <ReadingProvider
      initial={initial}
      release={publicReleaseId(process.env.VERCEL_GIT_COMMIT_SHA)}
    >
      <PrayerWorkspaceProvider
        key={user?.id ?? "guest"}
        owner={user?.id ?? null}
      >
        <div className="gc-shell">
          <PushSessionBoundary owner={user?.id ?? null} />
          <MeasurementForeground owner={user?.id ?? null} />
          <FeedbackPrompt key={user?.id ?? "guest"} owner={user?.id ?? null} />
          <a href="#platform-content" className="gc-skip">
            Skip to content
          </a>
          <header className="gc-topbar">
            <Link href="/platform" className="wordmark gc-brand">
              <Church aria-hidden="true" />
              God’s Churches
            </Link>
            <span className="gc-tagline">
              Faith. Fellowship. Everyday life.
            </span>
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
                  href={
                    signInReturnTo
                      ? accountEntryHref("login", signInReturnTo)
                      : "/platform/login"
                  }
                  className="gc-button gc-button-quiet"
                >
                  Sign in
                </Link>
              )}
            </nav>
          </header>
          <div className="gc-workspace">
            <PortalNavigation
              owner={user?.id}
              username={user?.username}
              reviewerNavigation={reviewerNavigation}
            />
            <main id="platform-content" tabIndex={-1} className="gc-main">
              {newAccount && (
                <PostSignupHelp emailPending={user?.emailVerifiedAt === null} />
              )}
              {children}
            </main>
          </div>
          <footer className="gc-platform-footer">
            <AppearanceSelect />
            <LoadedVersion />
            <Link href="/platform/features">Explore features</Link>
            <Link href="/platform/releases">What’s new</Link>
            <MissionSignature />
            <Link href="/about#our-mission">Our mission</Link>
            <Link href="/help">Help</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </footer>
        </div>
      </PrayerWorkspaceProvider>
    </ReadingProvider>
  );
}
