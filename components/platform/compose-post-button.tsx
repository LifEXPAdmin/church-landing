"use client";

import { PenLine } from "lucide-react";

export function ComposePostButton() {
  return (
    <button
      type="button"
      className="gc-button gc-compose-trigger"
      onClick={() => {
        const composer = document.getElementById("compose-post");
        if (composer instanceof HTMLButtonElement) composer.click();
      }}
    >
      <PenLine aria-hidden="true" />
      Share a post
    </button>
  );
}
