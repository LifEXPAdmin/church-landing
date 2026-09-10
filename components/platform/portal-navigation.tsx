"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Church, Home, Search, Menu } from "lucide-react";

export function PortalNavigation({
  username,
  reviewerNavigation
}: {
  username?: string;
  reviewerNavigation: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  const links = [
    { href: "/platform", label: "Home", icon: Home },
    {
      href: username ? "/platform/my-church" : "/platform/churches",
      label: username ? "My church" : "Churches",
      icon: Church
    },
    { href: "/platform/search", label: "Explore", icon: Search },
    { href: "/platform/menu", label: "Menu", icon: Menu }
  ];
  const active = (href: string) =>
    pathname === href ||
    (href !== "/platform" && pathname.startsWith(`${href}/`));
  return (
    <aside className="gc-navigation">
      <nav
        aria-label="Platform"
        id="platform-navigation"
        className="gc-primary-nav"
      >
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={label}
            href={href}
            aria-current={active(href) ? "page" : undefined}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      {reviewerNavigation.length > 0 && (
        <nav aria-label="Church administration" className="gc-reviewer-nav">
          <p className="gc-eyebrow">Your church tools</p>
          {reviewerNavigation.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
      <div className="gc-nav-note">
        <span className="gc-eyebrow">Many callings. One Body.</span>
        <p>
          A place to grow in faith, find your people, and put love into
          practice.
        </p>
        <Link href="/platform/help">Need a hand?</Link>
      </div>
    </aside>
  );
}
