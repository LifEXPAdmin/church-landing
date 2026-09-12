"use client";
import { useEffect, useId, useRef } from "react";
import { useDraftWorkspace } from "./draft-workspace-provider";
export function useUnsavedSocialWork(
  work: { dirty: boolean; saving: boolean; conflict: boolean },
  onBlocked: () => void
) {
  const { controller } = useDraftWorkspace();
  const key = useId(),
    notice = useRef(onBlocked);
  notice.current = onBlocked;
  const { dirty, saving, conflict } = work;
  const blocked = dirty || saving || conflict;
  useEffect(() => {
    controller.setExternalWork(key, { dirty, saving, conflict });
    return () => controller.setExternalWork(key, null);
  }, [controller, key, dirty, saving, conflict]);
  useEffect(() => {
    if (!blocked) return;
    const guard = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
        "a[href]"
      );
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !link ||
        link.target === "_blank" ||
        link.hasAttribute("download")
      )
        return;
      const url = new URL(link.href);
      if (
        url.pathname === location.pathname &&
        url.search === location.search &&
        url.hash
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      notice.current();
    };
    document.addEventListener("click", guard, true);
    return () => document.removeEventListener("click", guard, true);
  }, [blocked]);
}
