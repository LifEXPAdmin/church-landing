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
      <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-card/80 p-8 sm:p-12">
        <h1 className="mb-5 text-5xl leading-tight">{title}</h1>
        <p className="mb-8 text-lg text-muted-foreground">{intro}</p>
        <ul className="mb-10 space-y-3">
          {bullets.map((item) => (
            <li key={item} className="rounded-xl bg-muted/65 p-4 text-base">
              {item}
            </li>
          ))}
        </ul>
        <Button asChild size="lg">
          <Link href={`/join?role=${role}&source=segment-${role.toLowerCase()}`}>Join this waitlist</Link>
        </Button>
      </div>
    </section>
  );
}
