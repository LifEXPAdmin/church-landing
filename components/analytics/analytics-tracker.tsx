"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { trackClientEvent } from "@/lib/client-analytics";

export function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) {
      return;
    }

    trackClientEvent({
      eventType: "PAGE_VIEW",
      path: pathname
    });
  }, [pathname]);

  return null;
}
