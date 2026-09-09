import Link from "next/link";
import { Church } from "lucide-react";

const links = [
  { href: "/platform", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/help", label: "Help" }
];

export function SiteHeader() {
  return (
    <header className="gc-public-header">
      <div className="gc-topbar">
        <Link href="/platform" className="wordmark gc-brand">
          <Church aria-hidden="true" />
          Godschurches
        </Link>
        <Link href="/platform/login" className="gc-button gc-button-quiet">
          Sign in
        </Link>
      </div>
      <nav aria-label="Website" className="container-shell gc-public-nav">
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
