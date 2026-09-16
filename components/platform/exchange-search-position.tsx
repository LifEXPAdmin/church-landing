"use client";
import { useEffect, useRef } from "react";
import { useReadVisibility } from "./read-visibility";

/** History holds only a scroll number, route and account boundary, never rows. */
export function ExchangeSearchPosition({
  owner,
  path
}: {
  owner: string | null;
  path: string;
}) {
  const visible = useReadVisibility(),
    restored = useRef(false);
  useEffect(() => {
    if (!visible) return;
    if (!restored.current) {
      restored.current = true;
      const position = window.history.state?.gcExchangePosition;
      if (
        position?.owner === owner &&
        position.path === path &&
        Number.isFinite(position.y) &&
        position.y >= 0 &&
        position.y <= 100000
      ) {
        const frame = requestAnimationFrame(() =>
          window.scrollTo({ top: position.y, behavior: "instant" })
        );
        return () => cancelAnimationFrame(frame);
      }
    }
  }, [visible, owner, path]);
  useEffect(() => {
    if (!visible) return;
    const address = window.location.pathname + window.location.search;
    const save = () => {
      if (window.location.pathname + window.location.search !== address) return;
      window.history.replaceState(
        {
          ...window.history.state,
          gcExchangePosition: {
            owner,
            path,
            y: Math.min(window.scrollY, 100000)
          }
        },
        ""
      );
    };
    const leave = (event: MouseEvent) => {
      if (
        event.button === 0 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        event.target instanceof Element &&
        event.target.closest("a[href]")
      )
        save();
    };
    document.addEventListener("click", leave, true);
    window.addEventListener("pagehide", save);
    return () => {
      document.removeEventListener("click", leave, true);
      window.removeEventListener("pagehide", save);
    };
  }, [visible, owner, path]);
  return null;
}
