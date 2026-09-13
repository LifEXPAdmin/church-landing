"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { socialRequest } from "@/lib/platform/social-client";
import type { AdultMessageView } from "@/lib/platform/adult-message-types";

/** Only scalar authorized counts; the navigation never preloads message text. */
export function MessageBadge({ owner }: { owner?: string }) {
  const [count, setCount] = useState<number | null>(null),
    path = usePathname();
  useEffect(() => {
    if (!owner) return;
    let generation = 0,
      flight = false,
      active = true,
      timer: ReturnType<typeof setTimeout>,
      delay = 60000;
    const load = async () => {
      clearTimeout(timer);
      if (!active || flight || document.visibilityState === "hidden") return;
      flight = true;
      const seq = generation;
      try {
        const { data } = await socialRequest<AdultMessageView>(
          "/api/platform/messages?view=activity",
          undefined,
          owner
        );
        if (seq === generation) {
          setCount(
            data.activity
              ? data.activity.requestAlerts + data.activity.messageAlerts
              : null
          );
          delay = 60000;
        }
      } catch {
        if (seq === generation) {
          setCount(null);
          delay = Math.min(delay * 2, 300000);
        }
      } finally {
        flight = false;
        if (active) timer = setTimeout(load, seq === generation ? delay : 0);
      }
    };
    const hide = () => {
      generation++;
      active = false;
      setCount(null);
      clearTimeout(timer);
    };
    const resume = () => {
      if (document.visibilityState !== "hidden") {
        active = true;
        void load();
      }
    };
    const changed = () => {
      clearTimeout(timer);
      if (active) timer = setTimeout(load, 1000);
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : resume();
    void load();
    window.addEventListener("blur", hide);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("messages-changed", changed);
    window.addEventListener("social-relationships-changed", changed);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("messages-changed", changed);
      window.removeEventListener("social-relationships-changed", changed);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [owner, path]);
  return count ? (
    <span
      className="gc-message-count"
      aria-label={`${count} unread message or request alerts`}
    >
      {count > 99 ? "99+" : count}
    </span>
  ) : null;
}
