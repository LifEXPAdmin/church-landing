import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="gc-platform-footer">
      <span>© {new Date().getFullYear()} Godschurches. Built on faith.</span>
      <Link href="/about">About</Link>
      <Link href="/help">Help</Link>
      <Link href="/manifesto">Manifesto</Link>
      <Link href="/privacy">Privacy</Link>
      <Link href="/terms">Terms</Link>
    </footer>
  );
}
