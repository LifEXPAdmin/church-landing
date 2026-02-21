"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error(error);

  return (
    <html lang="en">
      <body className="bg-[#f8f2e8] text-[#23180f]">
        <section className="container-shell py-24">
          <div className="mx-auto max-w-xl rounded-3xl border border-[#dec39a] bg-white/70 p-10 text-center">
            <h1 className="mb-3 text-5xl">Service Error</h1>
            <p className="mb-8">
              We hit a critical error while loading the site. Please retry. If it persists, contact
              mcdrew169@yahoo.com.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button onClick={reset}>Retry</Button>
              <Button asChild variant="secondary">
                <a href="mailto:mcdrew169@yahoo.com">Contact Support</a>
              </Button>
            </div>
          </div>
        </section>
      </body>
    </html>
  );
}
