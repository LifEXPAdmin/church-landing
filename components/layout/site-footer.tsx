import Link from "next/link";

export function MissionSignature() {
  return <span>United in Christ. Equipping believers. Making disciples.</span>;
}

export function SiteFooter() {
  return (
    <footer className="gc-platform-footer">
      <MissionSignature />
      <span>© {new Date().getFullYear()} Godschurches.</span>
      <Link href="/about#our-mission">Our mission</Link>
      <Link href="/help">Help</Link>
      <Link href="/manifesto">Manifesto</Link>
      <Link href="/privacy">Privacy</Link>
      <Link href="/terms">Terms</Link>
    </footer>
  );
}
