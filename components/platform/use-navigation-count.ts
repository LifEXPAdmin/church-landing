"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { onNotificationChanged } from "./notification-refresh";

type Count = { count: number | null; unavailable: boolean };
const empty: Count = { count: null, unavailable: false };
/** Foreground-only polling. Neither navigation entry retains source contents. */
export function useNavigationCount(
  owner: string | undefined,
  read: (owner: string) => Promise<number | null>
): Count {
  const path = usePathname();
  const [result, setResult] = useState<
    Count & { owner: string; path: string }
  >();
  useEffect(() => {
    if (!owner) return;
    let generation = 0,
      flight = false,
      active = true,
      disposed = false,
      timer: ReturnType<typeof setTimeout>,
      delay = 60000;
    const save = (value: Count) => setResult({ ...value, owner, path });
    const load = async () => {
      clearTimeout(timer);
      if (
        disposed ||
        !active ||
        flight ||
        document.visibilityState === "hidden"
      )
        return;
      flight = true;
      const seq = generation;
      try {
        const count = await read(owner);
        if (!disposed && seq === generation) {
          save({ count, unavailable: count === null });
          delay = 60000;
        }
      } catch {
        if (!disposed && seq === generation) {
          save({ count: null, unavailable: true });
          delay = Math.min(delay * 2, 300000);
        }
      } finally {
        flight = false;
        if (!disposed && active)
          timer = setTimeout(load, seq === generation ? delay : 0);
      }
    };
    const hide = () => {
      generation++;
      active = false;
      save(empty);
      clearTimeout(timer);
    };
    const resume = () => {
      if (document.visibilityState !== "hidden") {
        active = true;
        void load();
      }
    };
    const changed = () => {
      generation++;
      clearTimeout(timer);
      if (active) timer = setTimeout(load, 1000);
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : resume();
    save(empty);
    void load();
    const unsubscribe = onNotificationChanged(owner, changed);
    window.addEventListener("blur", hide);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("messages-changed", changed);
    window.addEventListener("social-relationships-changed", changed);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      generation++;
      clearTimeout(timer);
      unsubscribe();
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("messages-changed", changed);
      window.removeEventListener("social-relationships-changed", changed);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [owner, path, read]);
  return result?.owner === owner && result?.path === path ? result : empty;
}
