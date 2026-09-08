"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { portalButtonClass } from "@/components/platform/portal-action-form";
import {
  PortalHelpContact,
  portalLinkClass
} from "@/components/platform/portal-ui";

export function PortalRouteError({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <main className="min-h-screen bg-[#100b07] py-10 text-[#f8ead6]">
      <div className="container-shell space-y-6">
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-4xl text-white focus:outline-none"
        >
          Godschurches could not load this page
        </h1>
        <p role="alert" className="text-[#d8c4a8]">
          Please try again. No private information has been displayed.
        </p>
        <div className="flex flex-wrap items-center gap-5">
          <button type="button" onClick={reset} className={portalButtonClass}>
            Try again
          </button>
          <Link href="/platform" className={portalLinkClass}>
            Back to Feed
          </Link>
          <Link href="/platform/login" className={portalLinkClass}>
            Sign in
          </Link>
        </div>
        <div className="max-w-2xl">
          <PortalHelpContact />
        </div>
      </div>
    </main>
  );
}
