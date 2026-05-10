import type { Metadata } from "next";
import { CheckCircle2, MailCheck, ShieldCheck, Sparkles } from "lucide-react";

import { JoinForm } from "@/components/join/join-form";

export const metadata: Metadata = {
  title: "Join Waitlist",
  description:
    "Join the Church waitlist as a believer, church, creator, business, or builder. Receive role-specific updates and launch invitations."
};

export default async function JoinPage({
  searchParams
}: {
  searchParams: Promise<{ role?: string; source?: string }>;
}) {
  const params = await searchParams;

  return (
    <section className="container-shell py-12 sm:py-16">
      <div className="mx-auto grid max-w-6xl gap-0 overflow-hidden rounded-[2rem] border border-border bg-card/90 shadow-[0_22px_80px_rgba(92,58,24,0.14)] lg:grid-cols-[0.85fr_1.15fr]">
        <aside className="relative overflow-hidden bg-[linear-gradient(160deg,#2a1d12_0%,#17100b_100%)] p-7 text-[#f7ead5] sm:p-10">
          <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[#c38a45]/25 blur-3xl" />
          <div className="absolute -bottom-24 left-8 h-64 w-64 rounded-full bg-[#f4c98c]/10 blur-3xl" />
          <div className="relative">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#f2d8af]/30 bg-black/20 px-3 py-1 text-xs uppercase tracking-[0.14em] text-[#f4c98c]">
              <Sparkles className="h-3.5 w-3.5" />
              Founding Waitlist
            </p>
            <h1 className="mb-4 text-balance text-5xl leading-tight sm:text-6xl">
              Join Church
            </h1>
            <p className="mb-4 text-lg text-[#ead9c0]">
              Tell us where you fit in The Revival so we can send the right
              launch updates, access invitations, and partnership opportunities.
            </p>
            <p className="mb-8 text-sm leading-relaxed text-[#d8c4a8]">
              Your signup is saved by role, which means believers, churches,
              creators, businesses, and builders each receive communication made
              for them.
            </p>

            <div className="bg-black/24 space-y-3 rounded-2xl border border-[#f2d8af]/25 p-4 text-sm">
              {[
                "Your signup is saved under your selected role.",
                "You receive updates matched to your role and calling.",
                "Early access invitations are released in phases."
              ].map((item) => (
                <div key={item} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#f4c98c]" />
                  <p className="text-[#f4e4ca]">{item}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-2xl border border-[#f2d8af]/20 bg-white/5 p-4">
                <MailCheck className="mb-2 h-5 w-5 text-[#f4c98c]" />
                <p className="font-semibold">Segmented emails</p>
                <p className="mt-1 text-[#d8c4a8]">
                  You hear from us based on what you are called to build or
                  find.
                </p>
              </div>
              <div className="rounded-2xl border border-[#f2d8af]/20 bg-white/5 p-4">
                <ShieldCheck className="mb-2 h-5 w-5 text-[#f4c98c]" />
                <p className="font-semibold">No noisy list</p>
                <p className="mt-1 text-[#d8c4a8]">
                  We are collecting a focused founding community, not chasing
                  spam.
                </p>
              </div>
            </div>
          </div>
        </aside>

        <div className="p-6 sm:p-8 lg:p-10">
          <JoinForm
            initialRole={params.role}
            source={params.source ?? "landing"}
          />
        </div>
      </div>
    </section>
  );
}
