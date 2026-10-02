"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { useReadVisibility } from "./read-visibility";

// Rendering and command continuation share the same synchronous foreground
// generation. Connectivity hints alone cannot resume a concealed editor.
export function useArtistContinuation(available: boolean) {
  const parent = useReadVisibility();
  const scope = useRef(parent),
    ready = useRef(available),
    active = useRef(false),
    generation = useRef(0);
  const [foreground, setForeground] = useState(false);
  const hide = useCallback(() => {
    generation.current++;
    active.current = false;
    setForeground(false);
  }, []);
  const resume = useCallback(() => {
    if (
      !scope.current ||
      document.visibilityState === "hidden" ||
      !navigator.onLine
    )
      return;
    generation.current++;
    active.current = true;
    setForeground(true);
  }, []);
  useLayoutEffect(() => {
    scope.current = parent;
    ready.current = available;
    generation.current++;
    if (!parent) hide();
  }, [parent, available, hide]);
  useEffect(() => {
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : resume();
    if (parent && document.hasFocus()) resume();
    else hide();
    window.addEventListener("blur", hide);
    window.addEventListener("pagehide", hide);
    window.addEventListener("offline", hide);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      window.removeEventListener("blur", hide);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("offline", hide);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [parent, hide, resume]);
  const current = useCallback(
    (recovery = false) =>
      active.current &&
      scope.current &&
      (recovery || ready.current) &&
      document.visibilityState !== "hidden" &&
      navigator.onLine
        ? generation.current
        : null,
    []
  );
  return { visible: parent && foreground && available, current, resume };
}
export type ArtistContinuation = ReturnType<typeof useArtistContinuation>;
