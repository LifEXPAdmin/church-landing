"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { MeasurementState } from "@/lib/platform/platform-measurement";
const surfaces = new Set([
  "/platform",
  "/platform/menu",
  "/platform/search",
  "/platform/topics",
  "/platform/churches"
]);
/** Idle choice lookup; only a trusted, visible navigation interaction can write. */
export function MeasurementForeground({ owner }: { owner: string | null }) {
  const path = usePathname();
  useEffect(() => {
    if (!owner || !surfaces.has(path)) return;
    let live = true,
      state: MeasurementState | null = null,
      busy = false,
      lastAttempt = 0;
    const headers = {
      "Content-Type": "application/json",
      "X-Expected-Account": owner
    };
    const load = async () => {
      state = null;
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/platform/measurement", {
          headers,
          cache: "no-store",
          credentials: "same-origin"
        });
        if (!r.ok) {
          await r.body?.cancel();
          return;
        }
        const next = (await r.json()) as MeasurementState;
        if (
          live &&
          document.visibilityState === "visible" &&
          next.ownerId === owner
        )
          state = next;
      } catch {
        /* Optional collection never interrupts navigation. */
      }
    };
    const timer = window.setTimeout(() => void load(), 1500);
    const signal = async (event: Event) => {
      if (
        !event.isTrusted ||
        !live ||
        busy ||
        !state?.collecting ||
        document.visibilityState !== "visible" ||
        !document.hasFocus() ||
        Date.now() - lastAttempt < 60000
      )
        return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        !target?.closest("nav,header") ||
        target.closest("form,input,textarea,select,[role=dialog]")
      )
        return;
      busy = true;
      lastAttempt = Date.now();
      const choice = state;
      let device = "UNKNOWN",
        browser = "UNKNOWN";
      if (choice.shareDevice) {
        const agent = navigator.userAgent;
        device = /iPad|Tablet/i.test(agent)
          ? "TABLET"
          : /Mobile|Android/i.test(agent)
            ? "PHONE"
            : "COMPUTER";
        browser = /Edg/i.test(agent)
          ? "EDGE"
          : /Firefox|FxiOS/i.test(agent)
            ? "FIREFOX"
            : /Chrome|CriOS/i.test(agent)
              ? "CHROME"
              : /Safari/i.test(agent)
                ? "SAFARI"
                : "OTHER";
      }
      try {
        const r = await fetch("/api/platform/measurement", {
          method: "POST",
          headers,
          cache: "no-store",
          credentials: "same-origin",
          keepalive: true,
          body: JSON.stringify({
            operation: "foreground",
            choiceVersion: choice.version,
            afterForegroundAt: choice.foregroundCursor,
            device,
            browser
          })
        });
        if (!r.ok) {
          await r.body?.cancel();
          state = null;
          return;
        }
        const result = await r.json();
        if (result.accepted) window.dispatchEvent(new CustomEvent("platform-quiet-navigation", { detail: { owner } }));
        if (live && state === choice) {
          if (typeof result.cursor === "string")
            state.foregroundCursor = result.cursor;
          else state = null;
        }
      } catch {
        /* An uncertain cursor is never replaced with a new client event. */
      } finally {
        busy = false;
      }
    };
    const visibility = () => {
      if (document.visibilityState !== "visible") state = null;
      else void load();
    };
    document.addEventListener("pointerdown", signal, { passive: true });
    document.addEventListener("keydown", signal);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("platform-measurement-changed", load);
    return () => {
      live = false;
      state = null;
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", signal);
      document.removeEventListener("keydown", signal);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("platform-measurement-changed", load);
    };
  }, [owner, path]);
  return null;
}
