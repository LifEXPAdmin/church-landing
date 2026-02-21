import type { Metadata } from "next";

import { JoinForm } from "@/components/join/join-form";

export const metadata: Metadata = {
  title: "Join Waitlist",
  description:
    "Join the Church waitlist as a believer, church, creator, business, or builder. Get role-specific updates and launch invites."
};

export default async function JoinPage({
  searchParams
}: {
  searchParams: Promise<{ role?: string; source?: string }>;
}) {
  const params = await searchParams;

  return (
    <section className="container-shell py-16 sm:py-20">
      <div className="mx-auto grid max-w-5xl gap-10 rounded-3xl border border-border bg-card/80 p-8 sm:grid-cols-[1fr_1.2fr] sm:p-10">
        <aside>
          <h1 className="mb-4 text-5xl leading-tight">Join Church</h1>
          <p className="mb-4 text-muted-foreground">
            This is the founding waitlist for The Revival movement. Tell us your role and what you are called to
            build.
          </p>
          <p className="mb-8 text-sm text-muted-foreground">
            We review submissions by role so early access and partnership invites are intentional.
          </p>

          <div className="space-y-2 rounded-xl bg-muted/65 p-4 text-sm">
            <p className="font-semibold">What happens next?</p>
            <p>1. Your signup is saved in your role segment.</p>
            <p>2. You receive updates relevant to your role.</p>
            <p>3. Early access invites are rolled out in waves.</p>
          </div>
        </aside>

        <JoinForm initialRole={params.role} source={params.source ?? "landing"} />
      </div>
    </section>
  );
}
