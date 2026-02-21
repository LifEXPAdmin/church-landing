import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const roleLabels: Record<string, string> = {
  BELIEVER: "Believer / Community",
  CHURCH: "Church / Pastor",
  CREATOR: "Creator / Preacher",
  BUSINESS: "Business",
  BUILDER: "Builder / Volunteer"
};

export const metadata: Metadata = {
  title: "Thanks for Joining",
  description: "Your waitlist request has been received."
};

export default async function ThanksPage({
  searchParams
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const params = await searchParams;
  const role = params.role ? roleLabels[params.role] : null;

  return (
    <section className="container-shell py-24">
      <div className="mx-auto max-w-2xl rounded-3xl border border-border bg-card/80 p-10 text-center">
        <h1 className="mb-4 text-5xl">Thank you.</h1>
        <p className="mb-3 text-lg text-muted-foreground">
          Your waitlist request has been received. We will follow up as early access opens.
        </p>
        {role ? <p className="mb-8 text-sm text-muted-foreground">Segment: {role}</p> : <div className="mb-8" />}
        <Button asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </section>
  );
}
