"use client";

import { useState } from "react";
import type { ReadingPreferences } from "@/lib/platform/reading-preferences";

const samples = [
  {
    title: "A place to belong",
    text: "A little space to listen. Share a thought, ask a question, or find a moment of encouragement in your community."
  },
  {
    title: "Make room for one another",
    text: "A welcoming conversation starts with time to read. Comfortable spacing helps every story feel a little easier to follow."
  }
];

export function DisplayPreview({
  preferences
}: {
  preferences: ReadingPreferences;
}) {
  const [page, setPage] = useState(0);
  const visible = preferences.mode === "list" ? samples : [samples[page]];
  return (
    <section
      className="platform-design gc-display-preview space-y-4"
      aria-label="Display preview"
      data-appearance={preferences.appearance}
      data-reader-size={preferences.size}
      data-reduce-motion={preferences.reduceMotion}
    >
      <h3>Preview your reading view</h3>
      <p className="text-sm text-gc-muted">
        Sample posts using your chosen display settings.
      </p>
      <div className="space-y-3" aria-live="polite" aria-atomic="true">
        {visible.map((sample) => (
          <article
            key={sample.title}
            className="gc-display-preview-card space-y-2"
          >
            <p className="text-sm text-gc-muted">Community sample</p>
            <h4>{sample.title}</h4>
            <p className="gc-reader-sample">{sample.text}</p>
          </article>
        ))}
      </div>
      {preferences.mode === "pages" && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={page === 0}
            onClick={() => setPage(0)}
          >
            Previous sample
          </button>
          <span className="text-sm">
            Sample {page + 1} of {samples.length}
          </span>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={page === samples.length - 1}
            onClick={() => setPage(1)}
          >
            Next sample
          </button>
        </div>
      )}
      <p className="text-sm text-gc-muted">
        {preferences.reduceMotion
          ? "Extra reduced motion is on."
          : "Your device’s reduced-motion preference still applies."}{" "}
        {preferences.reduceData
          ? "Smaller photo previews will be used after saving."
          : "Open a photo to request its larger image."}
      </p>
    </section>
  );
}
