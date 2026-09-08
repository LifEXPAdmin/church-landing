import Link from "next/link";
import type { PlatformUser } from "@prisma/client";
import { Church, LogOut } from "lucide-react";

import { logoutPlatformAccount } from "@/app/platform/actions";
import { PortalNavigation } from "@/components/platform/portal-navigation";

interface PlatformShellProps {
  user: Pick<PlatformUser, "name" | "username"> | null;
  children: React.ReactNode;
  reviewerNavigation?: { href: string; label: string }[];
}

const utilityLink =
  "inline-flex min-h-11 items-center rounded-full px-3 py-2 text-sm text-[#e8d3b2] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4c98c]";

export function PlatformShell({
  user,
  children,
  reviewerNavigation = []
}: PlatformShellProps) {
  return (
    <div className="min-h-screen bg-[#100b07] text-[#f8ead6]">
      <a
        href="#platform-content"
        className="sr-only z-50 rounded-lg bg-[#f4c98c] p-3 text-[#100b07] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <header className="border-b border-[#f2d8af]/20 bg-[#17100b]/95">
        <div className="container-shell flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
          <Link
            href="/platform"
            className="wordmark inline-flex min-h-11 items-center gap-2 rounded-lg text-3xl text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4c98c]"
          >
            <Church aria-hidden="true" className="h-6 w-6 text-[#f4c98c]" />
            Godschurches
          </Link>
          <nav
            aria-label="Account and website"
            className="flex flex-wrap items-center gap-1"
          >
            <Link href="/" className={utilityLink}>
              Landing page
            </Link>
            {user ? (
              <>
                <Link href="/platform/profile/me" className={utilityLink}>
                  Edit profile
                </Link>
                <Link href="/platform/settings" className={utilityLink}>
                  Settings
                </Link>
                <form action={logoutPlatformAccount}>
                  <button className={utilityLink} type="submit">
                    <LogOut aria-hidden="true" className="mr-2 h-4 w-4" />
                    Log out
                  </button>
                </form>
              </>
            ) : (
              <Link href="/platform/login" className={utilityLink}>
                Sign in
              </Link>
            )}
          </nav>
        </div>
        <PortalNavigation
          username={user?.username}
          reviewerNavigation={reviewerNavigation}
        />
      </header>
      <main
        id="platform-content"
        tabIndex={-1}
        className="min-h-[65vh] pb-[calc(6rem+env(safe-area-inset-bottom))] outline-none md:pb-10"
      >
        {children}
      </main>
    </div>
  );
}
