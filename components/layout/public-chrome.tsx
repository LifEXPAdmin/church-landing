"use client";

import { usePathname } from "next/navigation";

export function PublicChrome({
  children,
  header,
  footer
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  footer: React.ReactNode;
}) {
  const pathname = usePathname();
  if (pathname === "/platform" || pathname.startsWith("/platform/")) {
    return <>{children}</>;
  }

  return (
    <div
      className="platform-design gc-public flex min-h-screen flex-col"
      data-appearance="system"
    >
      <a href="#website-content" className="gc-skip">
        Skip to content
      </a>
      {header}
      <main id="website-content" tabIndex={-1} className="flex-1">
        {children}
      </main>
      {footer}
    </div>
  );
}
