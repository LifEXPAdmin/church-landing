import Link from "next/link";

import { Button } from "@/components/ui/button";

const links = [
  { href: "/manifesto", label: "Manifesto" },
  { href: "/for-users", label: "Believers" },
  { href: "/for-churches", label: "Churches" },
  { href: "/for-creators", label: "Creators" },
  { href: "/for-businesses", label: "Businesses" }
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/25 bg-black/45 shadow-[0_8px_22px_rgba(0,0,0,0.18)] backdrop-blur-md">
      <div className="container-shell flex h-14 items-center justify-between gap-3 sm:h-16 sm:gap-4">
        <Link href="/" className="wordmark text-[2rem] font-semibold tracking-wide text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)] sm:text-3xl">
          Church
        </Link>
        <nav className="hidden items-center gap-5 text-sm text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)] md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-[#f6d39f]">
              {link.label}
            </Link>
          ))}
        </nav>
        <Button asChild size="sm" className="bg-[#c38a45] text-white shadow-[0_1px_2px_rgba(0,0,0,0.5)] hover:bg-[#aa7537]">
          <Link href="/join?source=header">Join Waitlist</Link>
        </Button>
      </div>

      <div className="container-shell pb-2 md:hidden">
        <nav className="no-scrollbar flex items-center gap-3 overflow-x-auto text-xs text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)] sm:text-sm">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="whitespace-nowrap py-1 transition-colors hover:text-[#f6d39f]">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
