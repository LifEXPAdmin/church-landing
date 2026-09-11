"use client";

import { churchContactPrivacy } from "@/lib/platform/church-contact-privacy";
import type { StructureSnapshot } from "@/lib/platform/church-structure-types";
import { useState, type ReactNode } from "react";
import { useChurchRefresh } from "./use-church-refresh";
import { chartControlClass } from "./church-chart-editor-controls";

// Server-rendered details/forms must not keep showing withdrawn contact data.
// A changed read requires an explicit reload so a form is never silently rebased.
export function ChurchSnapshotGuard({
  url,
  checksum,
  children
}: {
  url: string;
  checksum: string;
  children: ReactNode;
}) {
  const [notice, setNotice] = useState("");
  useChurchRefresh({
    url,
    async onData(value) {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify(churchContactPrivacy(value as StructureSnapshot))
        )
      );
      const current = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("");
      if (current !== checksum)
        setNotice(
          "Church information or sharing choices changed. Reload this page to review current details before continuing. Unsaved form entries will be cleared."
        );
    },
    onUnavailable() {
      setNotice(
        "Current church information could not be confirmed. Private details are hidden. Reload when your connection and church access are available."
      );
    }
  });
  if (notice)
    return (
      <div
        role="status"
        className="container-shell my-8 space-y-4 rounded-2xl border border-gc-divider bg-gc-surface p-5"
      >
        <p>{notice}</p>
        <button
          type="button"
          className={chartControlClass}
          onClick={() => window.location.reload()}
        >
          Reload current church information
        </button>
      </div>
    );
  return children;
}
