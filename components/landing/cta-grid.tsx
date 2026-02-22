"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const ctas = [
  {
    label: "Join the Community",
    role: "BELIEVER",
    priority: "primary",
    summary: "For believers who want daily fellowship, growth, and Christ-centered connection.",
    detail:
      "Find real Christian community, discover churches, and get early access to prayer circles, discipleship spaces, and trusted conversations that help you grow day by day.",
    action: "Join as Believer"
  },
  {
    label: "Partner as a Business",
    role: "BUSINESS",
    priority: "secondary",
    summary: "For business owners who want to support Kingdom impact through practical partnership.",
    detail:
      "Get updates on sponsorship opportunities, hiring needs, and launch initiatives where your business can support churches, creators, and outreach with measurable impact.",
    action: "Join as Business"
  },
  {
    label: "Share the Gospel",
    role: "CREATOR",
    priority: "secondary",
    summary: "For creators and preachers who want to publish messages with reach and clarity.",
    detail:
      "Be part of a platform built for testimonies, teaching, short videos, and Gospel media that helps people grow in faith without algorithmic noise.",
    action: "Join as Creator"
  },
  {
    label: "Build with Us",
    role: "BUILDER",
    priority: "secondary",
    summary: "For builders and volunteers who want to serve through product, design, and operations.",
    detail:
      "Help shape the foundations of Church from the ground up and receive role-specific updates for engineering, design, moderation, and launch support.",
    action: "Join as Builder"
  }
] as const;

function trackCtaEvent(role: string, label: string, eventType: "CTA_CLICK") {
  const payload = JSON.stringify({
    eventType,
    path: "/",
    role,
    label
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/track", new Blob([payload], { type: "application/json" }));
    return;
  }

  void fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true
  });
}

export function CtaGrid() {
  const router = useRouter();
  const [activeCta, setActiveCta] = useState<(typeof ctas)[number] | null>(null);

  return (
    <div className="w-full max-w-3xl">
      <div className="grid gap-3 sm:grid-cols-2">
        {ctas.map((cta) => (
          <Button
            key={cta.label}
            size="lg"
            variant={cta.priority === "primary" ? "default" : "secondary"}
            className={
              cta.priority === "primary"
                ? "justify-between rounded-xl bg-[#c38a45] text-white hover:bg-[#aa7537]"
                : "justify-between rounded-xl border border-[#f4d8ab]/50 bg-white/15 text-white hover:bg-white/25"
            }
            onClick={() => setActiveCta(cta)}
          >
            <span>{cta.label}</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        ))}
      </div>

      {activeCta ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
          onClick={() => setActiveCta(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-[#f2d8af]/45 bg-[#1f1510] p-5 text-[#f7ead5] shadow-2xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <p className="text-xl leading-tight sm:text-2xl">{activeCta.label}</p>
              <button
                type="button"
                aria-label="Close"
                className="rounded-full border border-[#f2d8af]/35 p-1.5 text-[#f7ead5] hover:bg-white/10"
                onClick={() => setActiveCta(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-4 text-sm text-[#f4e4ca] sm:text-base">{activeCta.summary}</p>
            <p className="mt-2 text-sm text-[#edd9bb] sm:text-base">{activeCta.detail}</p>

            <div className="mt-6 flex gap-3">
              <Button
                className="rounded-full bg-[#c38a45] text-white hover:bg-[#aa7537]"
                onClick={() => {
                  trackCtaEvent(activeCta.role, activeCta.label, "CTA_CLICK");
                  router.push(`/join?role=${activeCta.role}&source=hero-modal`);
                }}
              >
                {activeCta.action}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
