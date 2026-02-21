"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

const ctas = [
  {
    label: "Join the Community",
    role: "BELIEVER",
    priority: "primary",
    summary: "For believers who want daily fellowship, growth, and Christ-centered connection.",
    detail:
      "Find real Christian community, discover churches, and get early access to features built for prayer, discipleship, and meaningful relationships.",
    action: "Join as Believer"
  },
  {
    label: "Partner as a Business",
    role: "BUSINESS",
    priority: "secondary",
    summary: "For business owners who want to support Kingdom impact through practical partnership.",
    detail:
      "Get updates on sponsorship opportunities, hiring needs, and launch initiatives where your business can help fund real ministry outcomes.",
    action: "Join as Business"
  },
  {
    label: "Share the Gospel",
    role: "CREATOR",
    priority: "secondary",
    summary: "For creators and preachers who want to publish messages with reach and clarity.",
    detail:
      "Be part of a platform built for testimonies, teaching, and Gospel media that helps people grow in faith without algorithmic noise.",
    action: "Join as Creator"
  },
  {
    label: "Build with Us",
    role: "BUILDER",
    priority: "secondary",
    summary: "For builders and volunteers who want to serve through product, design, and operations.",
    detail:
      "Help shape the foundations of Church from the ground up and receive role-specific updates for engineering, design, and launch support.",
    action: "Join as Builder"
  }
] as const;

function trackCtaEvent(role: string, label: string, eventType: "CTA_CLICK" | "CTA_EXPAND" | "CTA_HOVER") {
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
  const [expandedRole, setExpandedRole] = useState<(typeof ctas)[number]["role"] | null>(null);
  const [hoveredRole, setHoveredRole] = useState<(typeof ctas)[number]["role"] | null>(null);

  const activeRole = expandedRole ?? hoveredRole;
  const activeCta = useMemo(() => ctas.find((item) => item.role === activeRole) ?? null, [activeRole]);

  function handleCtaClick(cta: (typeof ctas)[number]) {
    if (expandedRole === cta.role) {
      trackCtaEvent(cta.role, cta.label, "CTA_CLICK");
      router.push(`/join?role=${cta.role}&source=hero`);
      return;
    }

    setExpandedRole(cta.role);
    trackCtaEvent(cta.role, cta.label, "CTA_EXPAND");
  }

  return (
    <div className="w-full max-w-3xl">
      <div className="grid gap-3 sm:grid-cols-2">
        {ctas.map((cta) => {
          const isExpanded = expandedRole === cta.role;

          return (
            <Button
              key={cta.label}
              size="lg"
              variant={cta.priority === "primary" ? "default" : "secondary"}
              className={
                cta.priority === "primary"
                  ? "justify-between rounded-xl bg-[#c38a45] text-white hover:bg-[#aa7537]"
                  : "justify-between rounded-xl border border-[#f4d8ab]/50 bg-white/15 text-white hover:bg-white/25"
              }
              onMouseEnter={() => {
                if (expandedRole) return;
                setHoveredRole(cta.role);
                trackCtaEvent(cta.role, cta.label, "CTA_HOVER");
              }}
              onMouseLeave={() => {
                if (expandedRole) return;
                setHoveredRole(null);
              }}
              onClick={() => handleCtaClick(cta)}
            >
              <span>{cta.label}</span>
              <ArrowRight className={`h-4 w-4 transition-transform ${isExpanded ? "translate-x-0.5" : ""}`} />
            </Button>
          );
        })}
      </div>

      <div
        className={`mt-3 overflow-hidden rounded-xl border border-[#f2d8af]/45 bg-black/40 p-4 text-[#f7ead5] transition-all ${
          activeCta ? "max-h-72 opacity-100" : "max-h-0 border-transparent p-0 opacity-0"
        }`}
      >
        {activeCta ? (
          <div>
            <p className="text-sm font-semibold text-[#ffe8c5]">{activeCta.label}</p>
            <p className="mt-2 text-sm text-[#f4e4ca]">{activeCta.summary}</p>
            <p className="mt-2 text-sm text-[#edd9bb]">{activeCta.detail}</p>
            <div className="mt-4">
              <Button
                size="sm"
                className="rounded-full bg-[#c38a45] text-white hover:bg-[#aa7537]"
                onClick={() => router.push(`/join?role=${activeCta.role}&source=hero-card`)}
              >
                {activeCta.action}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
