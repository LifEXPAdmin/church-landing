"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

import { InfoModal } from "@/components/landing/info-modal";
import { trackClientEvent } from "@/lib/client-analytics";

const howItWorksCards = [
  {
    title: "Choose your role",
    body: "Believer, Church, Creator, Business, or Builder.",
    detail:
      "Pick the path that fits how you want to participate. This helps us send the right updates and invite the right people at the right time.",
    cta: "Choose your role",
    href: "/join?source=how-it-works-role"
  },
  {
    title: "Join the waitlist",
    body: "Share your details once so we can contact you about launch.",
    detail:
      "You complete one short form with your name, email, and optional note. We use it to place you in the right group and keep updates relevant.",
    cta: "Join the waitlist",
    href: "/join?source=how-it-works-waitlist"
  },
  {
    title: "Get relevant updates",
    body: "Role-specific emails for launch, hiring, and partner opportunities.",
    detail:
      "You will hear from us based on your role, like creator updates for creators and church updates for pastors, so messages stay useful and focused.",
    cta: "Get updates",
    href: "/join?source=how-it-works-updates"
  }
] as const;

export function HowItWorksGrid() {
  const router = useRouter();
  const [activeCard, setActiveCard] = useState<(typeof howItWorksCards)[number] | null>(null);

  return (
    <div className="mt-7 grid gap-3 sm:grid-cols-3">
      {howItWorksCards.map((item) => (
        <button
          type="button"
          key={item.title}
          className="group rounded-xl border border-[#f2d8af]/35 bg-black/35 px-4 py-3 text-left transition-all hover:bg-black/45 hover:shadow-[0_8px_22px_rgba(0,0,0,0.35)]"
          onClick={() => {
            setActiveCard(item);
            trackClientEvent({
              eventType: "CTA_CLICK",
              path: "/",
              label: `open:${item.title}`
            });
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[#ffe8c5]">{item.title}</p>
            <ArrowUpRight className="h-4 w-4 text-[#f6d8ab] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[#f4e4ca]">{item.body}</p>
        </button>
      ))}

      <InfoModal
        open={Boolean(activeCard)}
        title={activeCard?.title ?? ""}
        summary={activeCard?.body ?? ""}
        detail={activeCard?.detail ?? ""}
        ctaLabel={activeCard?.cta ?? "Continue"}
        badge="How It Works"
        onClose={() => setActiveCard(null)}
        onContinue={() => {
          if (!activeCard) {
            return;
          }

          trackClientEvent({
            eventType: "CTA_CLICK",
            path: "/",
            label: `continue:${activeCard.title}`
          });
          router.push(activeCard.href);
        }}
      />
    </div>
  );
}
