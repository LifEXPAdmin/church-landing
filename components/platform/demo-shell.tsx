import { Church } from "lucide-react";

import {
  DEMO_NOTICE,
  demoFixture,
  demoHref,
  demoViews
} from "@/lib/platform/demo-fixtures";

const linkClass =
  "inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm text-gc-muted hover:bg-gc-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gc-focus";

export function DemoShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gc-canvas text-gc-text">
      <a
        href="#demo-content"
        className="sr-only z-50 rounded-lg bg-gc-action p-3 text-gc-on-action focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to demo content
      </a>
      <header className="border-b border-gc-divider bg-gc-surface">
        <div className="container-shell flex flex-wrap items-center justify-between gap-x-5 gap-y-2 py-4">
          <a
            href={demoHref()}
            className="wordmark inline-flex min-h-11 items-center gap-2 rounded-lg text-3xl text-gc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gc-focus"
          >
            <Church aria-hidden="true" className="h-6 w-6 text-gc-accent" />
            Godschurches
          </a>
          <p className="text-sm font-semibold text-gc-accent">
            Read-only public demo
          </p>
        </div>
        <div className="border-y border-gc-action bg-gc-selected">
          <div className="container-shell py-4">
            <p className="font-semibold text-gc-accent">{DEMO_NOTICE}</p>
            <p className="mt-1 text-sm font-semibold text-gc-text">
              {demoFixture.church.name} (fictional church)
            </p>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-gc-muted">
              No account is needed. These fixed examples cannot change real
              accounts, requests, permissions, or contact details. All action
              controls are disabled.
            </p>
          </div>
        </div>
        <nav
          aria-label="Demo views"
          className="container-shell flex flex-wrap gap-1 py-2"
        >
          <a href={demoHref()} className={linkClass}>
            Overview
          </a>
          {demoViews.map((view) => (
            <a key={view.slug} href={demoHref(view.slug)} className={linkClass}>
              {view.title}
            </a>
          ))}
        </nav>
      </header>
      <main
        id="demo-content"
        tabIndex={-1}
        className="container-shell bg-gc-subtle py-8 outline-none sm:py-10"
      >
        {children}
      </main>
      <footer className="border-t border-gc-divider py-6">
        <div className="container-shell flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-2xl text-sm text-gc-muted">
            A visual demonstration, not a live church launch or verification of
            the real backend workflow.
          </p>
          <a href="/platform" className={linkClass}>
            Exit demo: real platform
          </a>
        </div>
      </footer>
    </div>
  );
}
