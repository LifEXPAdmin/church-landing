"use client";

type EventType = "PAGE_VIEW" | "CTA_CLICK" | "JOIN_SUBMIT" | "JOIN_SUCCESS";
type Role = "BELIEVER" | "CHURCH" | "CREATOR" | "BUSINESS" | "BUILDER";

interface ClientTrackInput {
  eventType: EventType;
  path: string;
  role?: Role;
  label?: string;
}

export function trackClientEvent(input: ClientTrackInput) {
  const payload = JSON.stringify(input);

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
