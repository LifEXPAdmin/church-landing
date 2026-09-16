"use client";
import { RegionalEventTime } from "./regional-presentation";
import { useEffect, useState } from "react";
import Link from "next/link";

/** Uses the source zone for SSR, then labels the device zone explicitly. */
export function LocalEventTime({
  event,
  rsvp = false
}: {
  event: {
    id: string;
    allDay: boolean;
    startLocal: string;
    endLocal: string;
    startAt: string;
    endAt: string;
    timeZone: string;
    canceled?: boolean;
  };
  rsvp?: boolean;
}) {
  const [deviceZone, setDeviceZone] = useState<string | null>(null);
  useEffect(() => {
    try {
      setDeviceZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      /* The explicitly named source zone remains usable. */
    }
  }, []);
  const zone = deviceZone || event.timeZone;
  return (
    <div className="space-y-2 text-sm">
      <p>{<RegionalEventTime event={event} timeZone={zone} />}</p>
      {!event.allDay && (
        <p className="text-gc-muted">
          {deviceZone ? "Your time" : "Event time"} · {zone}
        </p>
      )}
      {rsvp && (
        <Link
          className="inline-flex min-h-11 items-center text-gc-accent underline"
          href={`/platform/events/${encodeURIComponent(event.id)}?timeZone=${encodeURIComponent(zone)}`}
        >
          {event.canceled ? "View canceled event" : "Event details and RSVP"}
        </Link>
      )}
    </div>
  );
}
