"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { trackClientEvent } from "@/lib/client-analytics";

interface ThanksActionsProps {
  role?: string | null;
}

type Role = "BELIEVER" | "CHURCH" | "CREATOR" | "BUSINESS" | "BUILDER";

function asRole(role?: string | null): Role | undefined {
  if (role === "BELIEVER" || role === "CHURCH" || role === "CREATOR" || role === "BUSINESS" || role === "BUILDER") {
    return role;
  }
  return undefined;
}

export function ThanksActions({ role }: ThanksActionsProps) {
  const [copied, setCopied] = useState(false);
  const normalizedRole = asRole(role);

  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "https://godschurches.com";
    }
    return `${window.location.origin}/?source=invite`;
  }, []);

  return (
    <div className="mt-8 flex flex-wrap justify-center gap-3">
      <Button asChild className="rounded-full bg-[#c38a45] text-white hover:bg-[#aa7537]">
        <Link
          href="/"
          onClick={() =>
            trackClientEvent({
              eventType: "CTA_CLICK",
              path: "/thanks",
              role: normalizedRole,
              label: "thanks:back-home"
            })
          }
        >
          Back to home
        </Link>
      </Button>

      <Button
        variant="secondary"
        className="rounded-full border border-border bg-background/60"
        onClick={async () => {
          await navigator.clipboard.writeText(inviteUrl);
          setCopied(true);
          trackClientEvent({
            eventType: "CTA_CLICK",
            path: "/thanks",
            role: normalizedRole,
            label: "thanks:copy-invite"
          });
          window.setTimeout(() => setCopied(false), 1800);
        }}
      >
        {copied ? "Invite link copied" : "Invite a friend"}
      </Button>
    </div>
  );
}
