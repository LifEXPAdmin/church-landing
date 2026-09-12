"use client";
import { useState } from "react";
import { useDraftWorkspace } from "./draft-workspace-provider";
export function DiscussionBack() {
  const { controller } = useDraftWorkspace();
  const [notice, setNotice] = useState("");
  return (
    <div>
      <button
        type="button"
        className="gc-button gc-button-quiet"
        onClick={() => {
          const w = controller.getSnapshot().externalWork;
          if (w.dirty || w.saving || w.conflict) {
            setNotice("Save or resolve your comment before returning.");
            return;
          }
          if (history.length > 1) history.back();
          else location.assign("/platform");
        }}
      >
        Back to previous view
      </button>
      <p role="status">{notice}</p>
    </div>
  );
}
