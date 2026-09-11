"use client";

import { useEffect } from "react";
import { churchFocus } from "@/lib/platform/church-return-context";

export function ChurchReturnFocus({ focus }: { focus?: string }) {
  useEffect(() => {
    const id = churchFocus(focus);
    if (id)
      document
        .querySelector<HTMLElement>(`[data-church-focus="${id}"]`)
        ?.focus();
  }, [focus]);
  return null;
}
