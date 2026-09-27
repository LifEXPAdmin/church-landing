"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { currentPostAvailability } from "@/lib/platform/post-availability-client";
import type { PostResourceCard } from "@/lib/platform/post-resource-attachments";
import { useReadVisibility } from "./read-visibility";
import { RegionalEventTime } from "./regional-presentation";

export const resourceLabels = {
  exchangeListing: "Listing",
  eventOccurrence: "Event",
  volunteerOpportunity: "Opportunity",
  mediaCatalogItem: "Media"
};

/** No copied source metadata enters HTML/RSC. Active reads share the bounded post checker. */
export function PostResourceCards({
  postId,
  version,
  owner
}: {
  postId: string;
  version: number;
  owner: string | null;
}) {
  const visible = useReadVisibility();
  const root = useRef<HTMLDivElement>(null);
  const focused = useRef<boolean | null>(null);
  const connected = useRef<boolean | null>(null);
  const [cards, setCards] = useState<PostResourceCard[]>([]);
  useEffect(() => {
    let live = true,
      intersecting = false,
      sequence = 0;
    if (focused.current === null) focused.current = document.hasFocus();
    if (connected.current === null) connected.current = navigator.onLine;
    const active = () =>
      live &&
      visible &&
      focused.current &&
      connected.current &&
      intersecting &&
      document.visibilityState !== "hidden";
    const hide = () => {
      sequence++;
      setCards([]);
    };
    const refresh = async () => {
      if (!active()) return;
      const current = ++sequence;
      try {
        const result = await currentPostAvailability(postId, owner);
        if (current !== sequence || !active()) return;
        setCards(
          result.available && result.entryVersion === version
            ? (result.resources ?? [])
            : []
        );
      } catch {
        if (current === sequence) hide();
      }
    };
    const blur = () => {
      focused.current = false;
      hide();
    };
    const focus = () => {
      focused.current = true;
      void refresh();
    };
    const change = () => {
      hide();
      void refresh();
    };
    const offline = () => {
      connected.current = false;
      hide();
    };
    const online = () => {
      connected.current = true;
      change();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? blur() : focus();
    const observer = new IntersectionObserver((entries) => {
      intersecting = entries.some((e) => e.isIntersecting);
      if (intersecting) void refresh();
      else hide();
    });
    if (root.current) observer.observe(root.current);
    const timer = setInterval(() => void refresh(), 30000);
    window.addEventListener("blur", blur);
    window.addEventListener("pagehide", blur);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", focus);
    window.addEventListener("pageshow", focus);
    window.addEventListener("online", online);
    window.addEventListener("social-relationships-changed", change);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      setCards([]);
      live = false;
      sequence++;
      observer.disconnect();
      clearInterval(timer);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pagehide", blur);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pageshow", focus);
      window.removeEventListener("online", online);
      window.removeEventListener("social-relationships-changed", change);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [postId, version, owner, visible]);
  return (
    <div ref={root} className="min-h-px" data-resource-cards={postId}>
      {visible && cards.length > 0 && (
        <ul aria-label="Attached resources" className="my-3 grid gap-2">
          {cards.map((card) => (
            <li
              key={`${card.kind}:${card.id}`}
              className="rounded-xl border border-gc-border p-3"
            >
              <p className="text-xs text-gc-muted">
                {resourceLabels[card.kind]} · {card.state}
              </p>
              <Link
                href={card.href}
                className="inline-flex min-h-11 items-center font-semibold underline"
              >
                {card.title}
              </Link>
              {card.startAt &&
                card.endAt &&
                card.startLocal &&
                card.endLocal &&
                card.timeZone && (
                  <p className="text-sm">
                    <RegionalEventTime
                      event={{
                        startAt: card.startAt,
                        endAt: card.endAt,
                        startLocal: card.startLocal,
                        endLocal: card.endLocal,
                        allDay: !!card.allDay
                      }}
                      timeZone={card.timeZone}
                    />
                  </p>
                )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
