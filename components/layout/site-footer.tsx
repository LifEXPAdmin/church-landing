import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-[#17120d] py-10 text-[#e7dccd]">
      <div className="container-shell flex flex-col gap-4 text-sm md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} Church, for The Revival.</p>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/manifesto" className="hover:text-white">
            Manifesto
          </Link>
          <Link href="/privacy" className="hover:text-white">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-white">
            Terms
          </Link>
          <a href="mailto:mcdrew169@yahoo.com" className="hover:text-white">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
