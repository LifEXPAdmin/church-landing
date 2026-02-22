"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

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
          className="rounded-xl border border-[#f2d8af]/35 bg-black/35 px-4 py-3 text-left transition-colors hover:bg-black/45"
          onClick={() => setActiveCard(item)}
        >
          <p className="text-sm font-semibold text-[#ffe8c5]">{item.title}</p>
          <p className="mt-1 text-xs text-[#f4e4ca]">{item.body}</p>
        </button>
      ))}

      {activeCard ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4" onClick={() => setActiveCard(null)}>
          <div
            className="w-full max-w-lg rounded-2xl border border-[#f2d8af]/45 bg-[#1f1510] p-5 text-[#f7ead5] shadow-2xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <p className="text-xl leading-tight sm:text-2xl">{activeCard.title}</p>
              <button
                type="button"
                aria-label="Close"
                className="rounded-full border border-[#f2d8af]/35 p-1.5 text-[#f7ead5] hover:bg-white/10"
                onClick={() => setActiveCard(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-4 text-sm text-[#f4e4ca] sm:text-base">{activeCard.body}</p>
            <p className="mt-2 text-sm text-[#edd9bb] sm:text-base">{activeCard.detail}</p>

            <div className="mt-6">
              <Button
                className="rounded-full bg-[#c38a45] text-white hover:bg-[#aa7537]"
                onClick={() => router.push(activeCard.href)}
              >
                {activeCard.cta}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
