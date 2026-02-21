"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) {
      return;
    }

    const payload = JSON.stringify({
      eventType: "PAGE_VIEW",
      path: pathname
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
  }, [pathname]);

  return null;
}
