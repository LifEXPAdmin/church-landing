import { Church } from "lucide-react";

import {
  DEMO_NOTICE,
  demoFixture,
  demoHref,
  demoViews
} from "@/lib/platform/demo-fixtures";

const linkClass =
  "inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm text-[#e8d3b2] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4c98c]";

export function DemoShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#100b07] text-[#f8ead6]">
      <a
        href="#demo-content"
        className="sr-only z-50 rounded-lg bg-[#f4c98c] p-3 text-[#100b07] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to demo content
      </a>
      <header className="border-b border-[#f2d8af]/20 bg-[#17100b]">
        <div className="container-shell flex flex-wrap items-center justify-between gap-x-5 gap-y-2 py-4">
          <a
            href={demoHref()}
            className="wordmark inline-flex min-h-11 items-center gap-2 rounded-lg text-3xl text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4c98c]"
          >
            <Church aria-hidden="true" className="h-6 w-6 text-[#f4c98c]" />
            Godschurches
          </a>
          <p className="text-sm font-semibold text-[#f4c98c]">
            Read-only public demo
          </p>
        </div>
        <div className="border-y border-[#f4c98c]/25 bg-[#f4c98c]/10">
          <div className="container-shell py-4">
            <p className="font-semibold text-[#f4c98c]">{DEMO_NOTICE}</p>
            <p className="mt-1 text-sm font-semibold text-[#f8ead6]">
              {demoFixture.church.name} (fictional church)
            </p>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[#e8d3b2]">
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
        className="container-shell bg-[radial-gradient(ellipse_at_top_left,rgba(195,138,69,0.08),transparent_55%)] py-8 outline-none sm:py-10"
      >
        {children}
      </main>
      <footer className="border-t border-[#f2d8af]/15 py-6">
        <div className="container-shell flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-2xl text-sm text-[#d8c4a8]">
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
