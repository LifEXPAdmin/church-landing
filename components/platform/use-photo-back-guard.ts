"use client";
import { useLayoutEffect, useRef } from "react";

// Multiple photo panels may contain work at once. They share one history entry
// so an upload and an edited caption cannot create competing Back handlers.
const pending = new Map<symbol, () => void>();
let guard: { key: string; address: string; back: () => void } | null = null;
let settling: Promise<void> | null = null;
let settled: (() => void) | null = null;
// History traversal is asynchronous. Hold a clicked destination until removal
// finishes so the cleanup cannot abort the new Next navigation.
function waitForCleanup(event: MouseEvent) {
  if (
    !settling ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
    "a[href]"
  );
  if (!link || link.target === "_blank" || link.hasAttribute("download"))
    return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void settling.then(() => {
    if (link.isConnected) link.click();
  });
}
export function settlePhotoNavigation() {
  return settling ?? Promise.resolve();
}
function stop() {
  if (guard) window.removeEventListener("popstate", guard.back);
  guard = null;
  document.removeEventListener("click", waitForCleanup, true);
  const done = settled;
  settled = null;
  settling = null;
  done?.();
}
function release() {
  if (!guard || pending.size) return;
  if (
    location.href === guard.address &&
    window.history.state?.gcPhotoWork === guard.key
  ) {
    // A viewer above this entry must close first. Its Back event then removes
    // the now-unneeded work entry without leaving an extra stop in history.
    if (!window.history.state?.gcPhotoViewer && !settling) {
      settling = new Promise((resolve) => {
        settled = resolve;
      });
      document.addEventListener("click", waitForCleanup, true);
      window.history.back();
    }
  } else stop();
}
function start() {
  if (guard) return;
  const key = crypto.randomUUID(),
    address = location.href;
  const back = () => {
    if (settling) {
      stop();
      // Work selected during cleanup gets a fresh entry, not a stranded wait.
      if (pending.size) start();
      return;
    }
    if (!pending.size) {
      release();
      return;
    }
    if (window.history.state?.gcPhotoWork === key) return;
    if (location.href === address)
      window.history.pushState(
        { ...window.history.state, gcPhotoWork: key },
        "",
        address
      );
    else window.history.forward();
    pending.forEach((notice) => notice());
  };
  guard = { key, address, back };
  window.history.pushState(
    { ...window.history.state, gcPhotoWork: key },
    "",
    address
  );
  window.addEventListener("popstate", back);
}
/** A same-address history entry lets normal browser Back preserve selected files. */
export function usePhotoBackGuard(blocked: boolean, onBlocked: () => void) {
  const notice = useRef(onBlocked);
  const registration = useRef<symbol | null>(null);
  notice.current = onBlocked;
  useLayoutEffect(() => {
    if (!blocked) return;
    const key = Symbol();
    registration.current = key;
    pending.set(key, () => notice.current());
    start();
    return () => {
      // A confirmed full-page navigation has already released this entry.
      // Do not race its redirect with the usual same-address history cleanup.
      if (registration.current !== key) return;
      registration.current = null;
      pending.delete(key);
      release();
    };
  }, [blocked]);
  return () => {
    const key = registration.current;
    if (!key) return;
    registration.current = null;
    pending.delete(key);
    if (!pending.size) stop();
  };
}
