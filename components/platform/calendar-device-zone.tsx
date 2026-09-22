"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { validCalendarDisplayZone } from "@/lib/platform/calendar-display";

/** A device-following URL is resolved again on each opening, including copied URLs. */
export function CalendarDeviceZone({
  enabled,
  timeZone,
  children
}: {
  enabled: boolean;
  timeZone: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!validCalendarDisplayZone(zone))
        throw new Error("Device time zone unavailable");
      if (zone === timeZone) setChecked(timeZone);
      else {
        const url = new URL(window.location.href);
        url.searchParams.set("timeZone", zone);
        url.searchParams.set("zoneMode", "DEVICE");
        router.replace(url.pathname + url.search + url.hash, { scroll: false });
      }
    } catch {
      setFailed(true);
    }
  }, [enabled, timeZone, router]);
  if (!enabled || checked === timeZone) return children;
  return (
    <section className="container-shell space-y-4 py-8" aria-live="polite">
      <p>
        {failed
          ? "This device’s time zone could not be checked. Choose a fixed viewing time zone to continue."
          : "Checking this device’s time zone…"}
      </p>
      <button
        className="gc-button gc-button-quiet"
        type="button"
        onClick={() => {
          const url = new URL(window.location.href);
          url.searchParams.set("zoneMode", "FIXED");
          url.searchParams.set("timeZone", timeZone);
          router.replace(url.pathname + url.search + url.hash, {
            scroll: false
          });
        }}
      >
        Use fixed {timeZone}
      </button>
    </section>
  );
}
