"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { portalButtonClass } from "@/components/platform/portal-action-form";
import {
  PortalHelpContact,
  portalLinkClass
} from "@/components/platform/portal-ui";

export function PortalRouteError() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <main className="min-h-screen bg-gc-canvas py-10 text-gc-text">
      <div className="container-shell space-y-6">
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-4xl text-gc-text focus:outline-none"
        >
          Godschurches could not load this page
        </h1>
        <p role="alert" className="text-gc-muted">
          Please try again. No private information has been displayed.
        </p>
        <div className="flex flex-wrap items-center gap-5">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={portalButtonClass}
          >
            Try again
          </button>
          <Link href="/platform" className={portalLinkClass}>
            Back to Home
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
