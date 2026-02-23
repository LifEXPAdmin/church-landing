"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { InfoModal } from "@/components/landing/info-modal";
import { trackClientEvent } from "@/lib/client-analytics";

const ctas = [
  {
    label: "Join the Community",
    role: "BELIEVER",
    priority: "primary",
    prompt: "Believers",
    summary: "For believers who want daily fellowship, growth, and Christ-centered connection.",
    detail:
      "Find real Christian community, discover churches, and get early access to prayer circles, discipleship spaces, and trusted conversations that help you grow day by day.",
    action: "Join as Believer"
  },
  {
    label: "Partner as a Business",
    role: "BUSINESS",
    priority: "secondary",
    prompt: "Businesses",
    summary: "For business owners who want to support Kingdom impact through practical partnership.",
    detail:
      "Get updates on sponsorship opportunities, hiring needs, and launch initiatives where your business can support churches, creators, and outreach with measurable impact.",
    action: "Join as Business"
  },
  {
    label: "Share the Gospel",
    role: "CREATOR",
    priority: "secondary",
    prompt: "Creators",
    summary: "For creators and preachers who want to publish messages with reach and clarity.",
    detail:
      "Be part of a platform built for testimonies, teaching, short videos, and Gospel media that helps people grow in faith without algorithmic noise.",
    action: "Join as Creator"
  },
  {
    label: "Build with Us",
    role: "BUILDER",
    priority: "secondary",
    prompt: "Builders",
    summary: "For builders and volunteers who want to serve through product, design, and operations.",
    detail:
      "Help shape the foundations of Church from the ground up and receive role-specific updates for engineering, design, moderation, and launch support.",
    action: "Join as Builder"
  }
] as const;

export function CtaGrid() {
  const router = useRouter();
  const [activeCta, setActiveCta] = useState<(typeof ctas)[number] | null>(null);

  return (
    <div className="w-full max-w-3xl">
      <div className="grid gap-3 sm:grid-cols-2">
        {ctas.map((cta) => {
          const isPrimary = cta.priority === "primary";

          return (
            <button
              key={cta.label}
              type="button"
              className={`group rounded-2xl border px-4 py-3 text-left transition-all ${
                isPrimary
                  ? "border-[#e5b370] bg-[#c38a45] text-white shadow-[0_8px_25px_rgba(0,0,0,0.25)] hover:bg-[#b27d3c]"
                  : "border-[#f4d8ab]/55 bg-white/12 text-white hover:bg-white/20"
              }`}
              onClick={() => {
                setActiveCta(cta);
                trackClientEvent({
                  eventType: "CTA_CLICK",
                  path: "/",
                  role: cta.role,
                  label: `open:${cta.label}`
                });
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.16em] text-[#fde8c4]/90">{cta.prompt}</p>
                  <p className="mt-1 text-xl leading-tight sm:text-2xl">{cta.label}</p>
                </div>
                <ArrowRight
                  className={`mt-1 h-4 w-4 transition-transform group-hover:translate-x-0.5 ${
                    isPrimary ? "text-white" : "text-[#f8dfb7]"
                  }`}
                />
              </div>
              <p className={`mt-2 text-sm ${isPrimary ? "text-[#fff3df]" : "text-[#f3dfbf]"}`}>{cta.summary}</p>
            </button>
          );
        })}
      </div>

      <InfoModal
        open={Boolean(activeCta)}
        title={activeCta?.label ?? ""}
        badge={activeCta?.prompt}
        summary={activeCta?.summary ?? ""}
        detail={activeCta?.detail ?? ""}
        ctaLabel={activeCta?.action ?? "Join"}
        onClose={() => setActiveCta(null)}
        onContinue={() => {
          if (!activeCta) {
            return;
          }

          trackClientEvent({
            eventType: "CTA_CLICK",
            path: "/",
            role: activeCta.role,
            label: `continue:${activeCta.label}`
          });
          router.push(`/join?role=${activeCta.role}&source=hero-modal`);
        }}
      />
    </div>
  );
}
