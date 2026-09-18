"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Church, Home, Search, Menu, MessageCircle } from "lucide-react";
import { MessageBadge } from "./message-badge";
import type { PrimaryNavigationItem } from "@/lib/platform/navigation-registry";

const icons = {
  home: Home,
  church: Church,
  search: Search,
  messages: MessageCircle,
  menu: Menu
};

export function PortalNavigation({
  links,
  owner,
  reviewerNavigation
}: {
  links: PrimaryNavigationItem[];
  owner?: string;
  reviewerNavigation: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navigation.current,
      shell = nav?.closest<HTMLElement>(".gc-shell");
    if (!nav || !shell) return;
    const measure = () =>
      shell.style.setProperty(
        "--gc-navigation-height",
        `${nav.getBoundingClientRect().height}px`
      );
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    measure();
    return () => {
      observer.disconnect();
      shell.style.removeProperty("--gc-navigation-height");
    };
  }, []);
  const active = (href: string) =>
    pathname === href ||
    (href !== "/platform" && pathname.startsWith(`${href}/`));
  return (
    <aside className="gc-navigation">
      <nav
        ref={navigation}
        aria-label="Platform"
        id="platform-navigation"
        className="gc-primary-nav"
      >
        {links.map(({ id, href, title, icon, prefetch }) => {
          const Icon = icons[icon];
          return (
            <Link
              key={id}
              href={href}
              prefetch={prefetch}
              aria-current={active(href) ? "page" : undefined}
            >
              <Icon aria-hidden="true" />
              <span>{title}</span>
              {id === "messages" && <MessageBadge owner={owner} />}
            </Link>
          );
        })}
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
