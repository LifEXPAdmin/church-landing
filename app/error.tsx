"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="container-shell py-24">
      <div className="mx-auto max-w-xl rounded-3xl border border-border bg-card/80 p-10 text-center">
        <h1 className="mb-3 text-5xl">Something Went Wrong</h1>
        <p className="mb-8 text-muted-foreground">
          An unexpected error occurred. Please try again. If the issue continues, email mcdrew169@yahoo.com.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button onClick={reset}>Try Again</Button>
          <Button asChild variant="secondary">
            <a href="mailto:mcdrew169@yahoo.com">Contact Support</a>
          </Button>
        </div>
      </div>
    </section>
  );
}
