"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

const ctas = [
  { label: "Join the Community", role: "BELIEVER", priority: "primary" },
  { label: "Partner as a Business", role: "BUSINESS", priority: "secondary" },
  { label: "Share the Gospel", role: "CREATOR", priority: "secondary" },
  { label: "Build with Us", role: "BUILDER", priority: "secondary" }
] as const;

function trackCtaClick(role: string, label: string) {
  const payload = JSON.stringify({
    eventType: "CTA_CLICK",
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
  return (
    <div className="grid w-full max-w-3xl gap-3 sm:grid-cols-2">
      {ctas.map((cta) => (
        <Button
          key={cta.label}
          asChild
          size="lg"
          variant={cta.priority === "primary" ? "default" : "secondary"}
          className={
            cta.priority === "primary"
              ? "justify-between rounded-xl bg-[#c38a45] text-white hover:bg-[#aa7537]"
              : "justify-between rounded-xl border border-[#f4d8ab]/50 bg-white/15 text-white hover:bg-white/25"
          }
        >
          <Link href={`/join?role=${cta.role}&source=hero`} onClick={() => trackCtaClick(cta.role, cta.label)}>
            {cta.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      ))}
    </div>
  );
}
