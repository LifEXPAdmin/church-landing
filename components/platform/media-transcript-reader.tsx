"use client";
import { useId, useMemo, useRef, useState } from "react";
import type { MediaChapter } from "@/lib/platform/media-transcript";

const SEARCH_RESULT_LIMIT = 100;
function markerTime(seconds: number) {
  const hours = Math.floor(seconds / 3600),
    minutes = Math.floor((seconds % 3600) / 60),
    remainder = String(seconds % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}`
    : `${minutes}:${remainder}`;
}

export function MediaTranscriptReader({
  transcriptText,
  chapters,
  durationSeconds
}: {
  transcriptText: string;
  chapters: MediaChapter[];
  durationSeconds: number | null;
}) {
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const feedbackId = useId(),
    term = query.trim();
  const search = useMemo(() => {
    const results: {
      index: number;
      text: string;
      before: string;
      after: string;
    }[] = [];
    if (!term) return { results, more: false };
    const literal = new RegExp(
      term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "giu"
    );
    let match: RegExpExecArray | null;
    while ((match = literal.exec(transcriptText))) {
      if (results.length === SEARCH_RESULT_LIMIT)
        return { results, more: true };
      const index = match.index,
        end = index + match[0].length,
        start = Math.max(0, index - 80),
        finish = Math.min(transcriptText.length, end + 120);
      results.push({
        index,
        text: match[0],
        before: `${start ? "…" : ""}${transcriptText.slice(start, index)}`,
        after: `${transcriptText.slice(end, finish)}${finish < transcriptText.length ? "…" : ""}`
      });
    }
    return { results, more: false };
  }, [term, transcriptText]);
  return (
    <>
      {chapters.length > 0 && (
        <section
          aria-label="Chapters"
          className="space-y-3 rounded-xl border p-4"
        >
          <h2 className="text-lg font-semibold">Chapters</h2>
          <p>
            Publisher-supplied reference times. These markers do not control
            external playback.
            {durationSeconds === null
              ? " Duration is unknown; marker times have not been checked against the recording's length."
              : ` Known duration: ${durationSeconds} seconds.`}
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            {chapters.map((chapter) => (
              <li key={chapter.startSeconds} className="break-words">
                <span className="font-semibold" aria-hidden="true">
                  {markerTime(chapter.startSeconds)}
                </span>
                <span className="sr-only">
                  {chapter.startSeconds} seconds from the beginning
                </span>{" "}
                {chapter.title}
              </li>
            ))}
          </ol>
        </section>
      )}
      {transcriptText && (
        <section
          aria-label="Transcript"
          className="space-y-4 rounded-xl border p-4"
        >
          <h2 className="text-lg font-semibold">Transcript</h2>
          <p id={`${feedbackId}-search-help`}>
            Publisher-supplied text. Search matches text within this transcript,
            without changing playback or searching other recordings.
          </p>
          <form
            role="search"
            aria-label="Search within this transcript"
            className="space-y-3"
            onSubmit={(event) => event.preventDefault()}
          >
            <label className="block">
              Search this transcript
              <input
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
                type="search"
                ref={searchInput}
                maxLength={160}
                value={query}
                aria-describedby={`${feedbackId}-search-help ${feedbackId}-search-status`}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={!query}
              onClick={() => {
                setQuery("");
                searchInput.current?.focus();
              }}
            >
              Clear transcript search
            </button>
          </form>
          <p
            id={`${feedbackId}-search-status`}
            role="status"
            aria-atomic="true"
          >
            {!term
              ? "Enter text to find matches. The full transcript is below."
              : search.more
                ? `Showing the first ${SEARCH_RESULT_LIMIT} matches. Use a longer search to narrow the results.`
                : search.results.length === 0
                  ? "No matches in this transcript."
                  : `${search.results.length} ${search.results.length === 1 ? "match" : "matches"} in this transcript.`}
          </p>
          {term && search.results.length > 0 && (
            <ol
              aria-label="Transcript search results"
              className="list-decimal space-y-3 pl-5"
            >
              {search.results.map((result) => (
                <li
                  key={result.index}
                  className="whitespace-pre-wrap break-words"
                >
                  {result.before}
                  <mark>{result.text}</mark>
                  {result.after}
                </li>
              ))}
            </ol>
          )}
          <h3 className="font-semibold">Full transcript</h3>
          <p className="whitespace-pre-wrap break-words">{transcriptText}</p>
        </section>
      )}
    </>
  );
}
