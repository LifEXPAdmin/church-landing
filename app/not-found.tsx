import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <section className="container-shell py-24">
      <div className="mx-auto max-w-xl rounded-3xl border border-border bg-card/80 p-10 text-center">
        <h1 className="mb-3 text-5xl">Page Not Found</h1>
        <p className="mb-8 text-muted-foreground">
          The page you requested is unavailable. You can return to the homepage or contact us directly.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/">Back Home</Link>
          </Button>
          <Button asChild variant="secondary">
            <a href="mailto:mcdrew169@yahoo.com">Contact Support</a>
          </Button>
        </div>
      </div>
    </section>
  );
}
