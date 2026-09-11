"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PrivateDraftPayload } from "@/lib/platform/post-workspace";

type Draft = {
  id: string;
  version: number;
  payload: PrivateDraftPayload;
  updatedAt: string;
};
type Page = { items: Draft[]; nextCursor: string | null };
type Discard = {
  operation: "delete-draft";
  id: string;
  expectedVersion: number;
  mutationId: string;
};

export function DraftLibrary({ ownerId }: { ownerId: string }) {
  const [data, setData] = useState<Page | null>(null);
  const [visible, setVisible] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [command, setCommand] = useState<Discard | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [conflict, setConflict] = useState(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const alive = useRef(true);
  const feedback = useRef<HTMLParagraphElement>(null);
  const concealed = useRef(false);
  const confirmation = useRef<HTMLDivElement>(null);

  const sameAccount = useCallback(async () => {
    const response = await fetch("/api/platform/profile", {
      cache: "no-store",
      credentials: "same-origin"
    });
    const profile = await response.json();
    if (!alive.current) return false;
    if (response.status === 401 || (response.ok && profile.id !== ownerId)) {
      generation.current++;
      concealed.current = true;
      setData(null);
      setCommand(null);
      setVisible(false);
      window.location.replace("/platform/drafts");
      return false;
    }
    if (!response.ok)
      throw new Error("Your sign-in could not be checked. Try again.");
    return true;
  }, [ownerId]);

  const load = useCallback(
    async (after?: string): Promise<void> => {
      if (busy.current) return;
      busy.current = true;
      const turn = ++generation.current;
      setPending(true);
      setMessage("");
      try {
        if (!(await sameAccount())) return;
        const response = await fetch(
          `/api/platform/post-workspace?${new URLSearchParams({ view: "drafts", ...(after ? { after } : {}) })}`,
          { cache: "no-store", credentials: "same-origin" }
        );
        const result = await response.json();
        if (response.status === 401) {
          concealed.current = true;
          setData(null);
          setCommand(null);
          window.location.replace("/platform/drafts");
          return;
        }
        if (!response.ok)
          throw new Error(result.message || "Drafts could not be loaded.");
        if (
          !(await sameAccount()) ||
          !alive.current ||
          turn !== generation.current ||
          concealed.current
        )
          return;
        setData((previous) => ({
          items:
            after && previous
              ? [
                  ...new Map(
                    [...previous.items, ...result.items].map((row: Draft) => [
                      row.id,
                      row
                    ])
                  ).values()
                ]
              : result.items,
          nextCursor: result.nextCursor
        }));
        setVisible(true);
      } catch (error) {
        if (alive.current && turn === generation.current)
          setMessage(
            error instanceof Error && !(error instanceof TypeError)
              ? error.message
              : "Drafts could not be loaded. Check your connection and retry."
          );
      } finally {
        busy.current = false;
        if (alive.current) {
          setPending(false);
          if (!concealed.current && turn !== generation.current) void load();
        }
      }
    },
    [sameAccount]
  );

  useEffect(() => {
    alive.current = true;
    void load();
    const hide = () => {
      concealed.current = true;
      generation.current++;
      setVisible(false);
      setData(null);
    };
    const restore = () => {
      if (document.visibilityState === "hidden") return;
      concealed.current = false;
      // A previous request may still be finishing. Never reveal its stale rows.
      if (!busy.current) void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : restore();
    const pageshow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        hide();
        restore();
      }
    };
    window.addEventListener("blur", hide);
    window.addEventListener("focus", restore);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pageshow", pageshow);
    return () => {
      alive.current = false;
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", restore);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pageshow", pageshow);
    };
  }, [load]);

  async function discard() {
    if (!command || busy.current || conflict) return;
    busy.current = true;
    setPending(true);
    setAttempted(true);
    setMessage("");
    const turn = generation.current;
    try {
      if (!(await sameAccount())) return;
      const response = await fetch("/api/platform/post-workspace", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command)
      });
      const result = await response.json();
      if (response.status === 401) {
        concealed.current = true;
        setData(null);
        setCommand(null);
        window.location.replace("/platform/drafts");
        return;
      }
      if (
        !(await sameAccount()) ||
        !alive.current ||
        turn !== generation.current
      )
        return;
      if (!response.ok) {
        if ([404, 409].includes(response.status)) setConflict(true);
        throw new Error(
          response.status === 409
            ? "This draft changed elsewhere. It has not been discarded. Refresh and review the current copy."
            : result.message || "Discard could not be confirmed."
        );
      }
      setData(
        (previous) =>
          previous && {
            ...previous,
            items: previous.items.filter((row) => row.id !== command.id)
          }
      );
      setCommand(null);
      setMessage("Draft discarded.");
    } catch (error) {
      if (alive.current && turn === generation.current)
        setMessage(
          error instanceof Error && !(error instanceof TypeError)
            ? error.message
            : "Discard could not be confirmed. Retry the same request to check safely."
        );
    } finally {
      busy.current = false;
      if (alive.current) {
        setPending(false);
        if (!concealed.current && turn !== generation.current) void load();
      }
      requestAnimationFrame(() => feedback.current?.focus());
    }
  }

  const selectedDraft = data?.items.find((draft) => draft.id === command?.id);

  return (
    <section
      className="space-y-5"
      aria-label="Your private drafts"
      aria-busy={pending}
    >
      <p className="text-gc-muted">
        Saved drafts are private to your account. Discarding a draft does not
        delete a published post.
      </p>
      <button
        type="button"
        className="gc-button gc-button-quiet"
        disabled={pending}
        onClick={() => {
          setCommand(null);
          setConflict(false);
          setAttempted(false);
          void load();
        }}
      >
        {" "}
        {pending ? "Loading…" : "Refresh drafts"}
      </button>
      <p ref={feedback} tabIndex={-1} role="status" className="break-words">
        {message || (!data ? "Loading your drafts…" : "")}
      </p>
      {visible && data && (
        <>
          {!data.items.length && <p>No saved drafts to show.</p>}
          <ul className="space-y-4" aria-label="Saved drafts">
            {data.items.map((draft, index) => (
              <li
                key={draft.id}
                className="space-y-3 rounded-xl border border-gc-divider bg-gc-surface p-5"
              >
                <h2 className="text-2xl">
                  {draft.payload.type.toLowerCase().replaceAll("_", " ")} draft
                </h2>
                <p className="text-sm text-gc-muted">
                  Last saved{" "}
                  <time dateTime={draft.updatedAt}>
                    {new Date(draft.updatedAt).toLocaleString()}
                  </time>
                </p>
                <p className="whitespace-pre-wrap break-words">
                  {draft.payload.content.trim()
                    ? draft.payload.content
                    : "No text entered yet."}
                </p>
                {draft.payload.scripture && (
                  <p className="whitespace-pre-wrap break-words">
                    {draft.payload.scripture}
                  </p>
                )}
                <Link
                  className="gc-button gc-button-quiet"
                  href={`/platform/drafts?resume=${encodeURIComponent(draft.id)}#resume`}
                >
                  Resume draft
                </Link>
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  aria-label={`Discard draft ${index + 1}`}
                  disabled={pending || !!command}
                  onClick={() => {
                    setCommand({
                      operation: "delete-draft",
                      id: draft.id,
                      expectedVersion: draft.version,
                      mutationId: crypto.randomUUID()
                    });
                    setAttempted(false);
                    setConflict(false);
                    setMessage("");
                    requestAnimationFrame(() => confirmation.current?.focus());
                  }}
                >
                  Discard
                </button>
              </li>
            ))}
          </ul>
          {command && (
            <div
              className="space-y-3 border-t border-gc-divider pt-3"
              ref={confirmation}
              tabIndex={-1}
              role="group"
              aria-label="Confirm discard"
            >
              <p>
                {conflict
                  ? "Review the latest saved copy before choosing Discard again."
                  : "Discard this saved draft? This cannot be undone."}
              </p>
              {selectedDraft && (
                <p className="break-words text-sm text-gc-muted">
                  Draft:{" "}
                  {selectedDraft.payload.content.trim().slice(0, 160) ||
                    "No text entered yet."}
                </p>
              )}
              {!conflict && (
                <button
                  type="button"
                  className="gc-button"
                  disabled={pending}
                  onClick={() => void discard()}
                >
                  {pending
                    ? "Checking…"
                    : attempted
                      ? "Retry discard"
                      : "Discard saved draft"}
                </button>
              )}
              <button
                type="button"
                className="gc-button gc-button-quiet"
                disabled={pending}
                onClick={() => {
                  setCommand(null);
                  setAttempted(false);
                  setConflict(false);
                  if (conflict || attempted) void load();
                }}
              >
                {conflict
                  ? "Refresh and review"
                  : attempted
                    ? "Check saved drafts"
                    : "Keep draft"}
              </button>
            </div>
          )}
          {data.nextCursor && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={pending || !!command}
              onClick={() => void load(data.nextCursor!)}
            >
              More drafts
            </button>
          )}
        </>
      )}
      {!visible && !pending && (
        <p>
          Your drafts are hidden until your sign-in is checked. Use Refresh
          drafts to continue.
        </p>
      )}
      <Link href="/platform/menu" className="gc-button gc-button-quiet">
        Back to Menu
      </Link>
      <noscript>Enable JavaScript to load your private drafts.</noscript>
    </section>
  );
}
