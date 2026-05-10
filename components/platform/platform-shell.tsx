import Link from "next/link";
import type { PlatformUser } from "@prisma/client";
import {
  Church,
  CircleUserRound,
  Home,
  LogOut,
  PlusSquare,
  Search,
  Settings,
  UserRound
} from "lucide-react";

import { logoutPlatformAccount } from "@/app/platform/actions";
import { Button } from "@/components/ui/button";

interface PlatformShellProps {
  user: Pick<PlatformUser, "name" | "username" | "role"> | null;
  children: React.ReactNode;
}

export function PlatformShell({ user, children }: PlatformShellProps) {
  return (
    <div className="min-h-screen bg-[#100b07] text-[#f8ead6]">
      <div className="border-b border-[#f2d8af]/20 bg-[#17100b]/95 backdrop-blur">
        <div className="container-shell flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
          <Link
            href="/platform"
            className="wordmark flex items-center gap-2 text-3xl text-white"
          >
            <Church className="h-6 w-6 text-[#f4c98c]" />
            Church
          </Link>
          <nav className="hidden flex-wrap items-center gap-2 text-sm md:flex">
            <Link
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 hover:bg-white/10"
              href="/platform"
            >
              <Home className="h-4 w-4" /> Feed
            </Link>
            <Link
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 hover:bg-white/10"
              href="/platform/search"
            >
              <Search className="h-4 w-4" /> Search
            </Link>
            {user ? (
              <>
                <Link
                  className="inline-flex items-center gap-2 rounded-full px-3 py-2 hover:bg-white/10"
                  href={`/platform/profile/${user.username}`}
                >
                  <UserRound className="h-4 w-4" /> Profile
                </Link>
                <Link
                  className="inline-flex items-center gap-2 rounded-full px-3 py-2 hover:bg-white/10"
                  href="/platform/profile/me"
                >
                  <Settings className="h-4 w-4" /> Edit
                </Link>
                <Link
                  className="inline-flex items-center gap-2 rounded-full px-3 py-2 hover:bg-white/10"
                  href="/platform/settings"
                >
                  <Settings className="h-4 w-4" /> Settings
                </Link>
                <form action={logoutPlatformAccount}>
                  <button
                    className="inline-flex items-center gap-2 rounded-full px-3 py-2 hover:bg-white/10"
                    type="submit"
                  >
                    <LogOut className="h-4 w-4" /> Log out
                  </button>
                </form>
              </>
            ) : (
              <Button asChild size="sm">
                <Link href="/platform/login">Create account</Link>
              </Button>
            )}
          </nav>

          {user ? (
            <Link
              href={`/platform/profile/${user.username}`}
              className="inline-flex items-center gap-2 rounded-full bg-black/20 px-3 py-2 text-sm md:hidden"
            >
              <CircleUserRound className="h-4 w-4 text-[#f4c98c]" /> @{user.username}
            </Link>
          ) : (
            <Button asChild size="sm" className="md:hidden">
              <Link href="/platform/login">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
      <main className="pb-24 md:pb-0">{children}</main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#f2d8af]/20 bg-[#17100b]/95 backdrop-blur md:hidden">
        <div className="container-shell grid grid-cols-5 gap-2 py-2 text-xs">
          <Link href="/platform" className="flex flex-col items-center rounded-xl py-2 text-[#f8ead6] hover:bg-white/10">
            <Home className="mb-1 h-4 w-4 text-[#f4c98c]" />
            Feed
          </Link>
          <Link href="/platform/search" className="flex flex-col items-center rounded-xl py-2 text-[#f8ead6] hover:bg-white/10">
            <Search className="mb-1 h-4 w-4 text-[#f4c98c]" />
            Search
          </Link>
          {user ? (
            <Link href="/platform" className="flex flex-col items-center rounded-xl py-2 text-[#f8ead6] hover:bg-white/10">
              <PlusSquare className="mb-1 h-4 w-4 text-[#f4c98c]" />
              Post
            </Link>
          ) : (
            <Link href="/platform/login" className="flex flex-col items-center rounded-xl py-2 text-[#f8ead6] hover:bg-white/10">
              <PlusSquare className="mb-1 h-4 w-4 text-[#f4c98c]" />
              Join
            </Link>
          )}
          {user ? (
            <Link href={`/platform/profile/${user.username}`} className="flex flex-col items-center rounded-xl py-2 text-[#f8ead6] hover:bg-white/10">
              <UserRound className="mb-1 h-4 w-4 text-[#f4c98c]" />
              Profile
            </Link>
          ) : (
            <Link href="/platform/login" className="flex flex-col items-center rounded-xl py-2 text-[#f8ead6] hover:bg-white/10">
              <UserRound className="mb-1 h-4 w-4 text-[#f4c98c]" />
              Account
            </Link>
          )}
          {user ? (
            <Link href="/platform/settings" className="flex flex-col items-center rounded-xl py-2 text-[#f8ead6] hover:bg-white/10">
              <Settings className="mb-1 h-4 w-4 text-[#f4c98c]" />
              Settings
            </Link>
          ) : (
            <Link href="/platform/login" className="flex flex-col items-center rounded-xl py-2 text-[#f8ead6] hover:bg-white/10">
              <Settings className="mb-1 h-4 w-4 text-[#f4c98c]" />
              Settings
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
