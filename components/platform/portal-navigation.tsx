"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Church, CircleHelp, Home, Search, UserRound } from "lucide-react";

export function PortalNavigation({
  username,
  reviewerNavigation
}: {
  username?: string;
  reviewerNavigation: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  const links = [
    { href: "/platform", label: "Feed", icon: Home },
    { href: "/platform/my-church", label: "My church", icon: Church },
    { href: "/platform/search", label: "Search", icon: Search },
    {
      href: username ? `/platform/profile/${username}` : "/platform/login",
      label: "Profile",
      icon: UserRound
    },
    { href: "/platform/help", label: "Help", icon: CircleHelp }
  ];
  const active = (href: string) =>
    pathname === href ||
    (href !== "/platform" && pathname.startsWith(`${href}/`));

  return (
    <>
      <nav
        aria-label="Platform"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[#f2d8af]/20 bg-[#17100b]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:static md:border-t-0 md:bg-transparent md:pb-0"
      >
        <div className="container-shell grid grid-cols-5 gap-1 py-2 md:flex md:gap-2">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4c98c] md:min-h-11 md:flex-row md:gap-2 md:px-4 md:text-sm ${active(href) ? "bg-[#f4c98c]/15 text-[#f4c98c]" : "text-[#e8d3b2] hover:bg-white/10"}`}
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
      {reviewerNavigation.length > 0 && (
        <nav
          aria-label="Church administration"
          className="border-t border-[#f2d8af]/10"
        >
          <div className="container-shell flex flex-wrap gap-2 py-2">
            {reviewerNavigation.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4c98c] ${pathname === href ? "bg-[#f4c98c]/15 text-[#f4c98c]" : "text-[#e8d3b2] hover:bg-white/10"}`}
              >
                {label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </>
  );
}
