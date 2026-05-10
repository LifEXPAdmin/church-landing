import Link from "next/link";
import type { PlatformUser } from "@prisma/client";
import {
  Church,
  Home,
  LogOut,
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
          <nav className="flex flex-wrap items-center gap-2 text-sm">
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
        </div>
      </div>
      <main>{children}</main>
    </div>
  );
}
