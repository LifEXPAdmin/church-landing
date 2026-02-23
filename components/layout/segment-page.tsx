import Link from "next/link";

import { Button } from "@/components/ui/button";

interface SegmentPageProps {
  title: string;
  intro: string;
  bullets: string[];
  role: string;
}

export function SegmentPage({ title, intro, bullets, role }: SegmentPageProps) {
  return (
    <section className="container-shell py-16 sm:py-20">
      <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-[linear-gradient(160deg,rgba(255,253,249,0.95),rgba(251,244,232,0.95))] p-8 shadow-[0_10px_30px_rgba(44,30,14,0.08)] sm:p-12">
        <p className="mb-3 inline-flex rounded-full border border-border bg-background/70 px-3 py-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Role segment
        </p>
        <h1 className="mb-5 text-5xl leading-tight">{title}</h1>
        <p className="mb-8 text-lg text-muted-foreground">{intro}</p>
        <ul className="mb-10 space-y-3">
          {bullets.map((item) => (
            <li key={item} className="rounded-xl border border-border/70 bg-muted/55 p-4 text-base">
              {item}
            </li>
          ))}
        </ul>
        <p className="mb-5 text-sm text-muted-foreground">
          Access opens in phases. Join your segment now to receive the earliest role-specific updates.
        </p>
        <Button asChild size="lg">
          <Link href={`/join?role=${role}&source=segment-${role.toLowerCase()}`}>Join this waitlist</Link>
        </Button>
      </div>
    </section>
  );
}
