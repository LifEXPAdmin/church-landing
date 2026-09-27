"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { PostResourceReference } from "@/lib/platform/post-resource-input";
import type { PostResourceCard } from "@/lib/platform/post-resource-attachments";
import { socialRequest } from "@/lib/platform/social-client";
import { useReadVisibility } from "./read-visibility";
import { portalInputClass } from "./portal-action-form";

const labels = {
  exchangeListing: "Listing",
  eventOccurrence: "Event",
  volunteerOpportunity: "Opportunity"
};
const key = (r: PostResourceReference) => `${r.kind}:${r.id}`;
function referenceFromUrl(text: string): PostResourceReference {
  const url = new URL(text.trim(), location.origin);
  if (url.origin !== location.origin || url.search || url.hash)
    throw new Error(
      "Copy a listing, event or opportunity page link from this website."
    );
  const match =
    /^\/platform\/(exchange\/(?:help\/)?|events\/|serve\/)([A-Za-z0-9_-]{1,100})\/?$/.exec(
      url.pathname
    );
  if (!match)
    throw new Error("Choose a listing, event or opportunity page link.");
  return {
    kind: match[1].startsWith("exchange")
      ? "exchangeListing"
      : match[1] === "events/"
        ? "eventOccurrence"
        : "volunteerOpportunity",
    id: match[2]
  };
}

export function PostResourceFields({
  owner,
  references,
  onChange
}: {
  owner: string;
  references: PostResourceReference[];
  onChange: (value: PostResourceReference[]) => void;
}) {
  const id = useId(),
    visible = useReadVisibility();
  const [url, setUrl] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    owner: string;
    selection: string;
    cards: PostResourceCard[];
  } | null>(null);
  const sequence = useRef(0),
    focused = useRef<boolean | null>(null),
    connected = useRef<boolean | null>(null),
    mounted = useRef(false);
  const pending = useRef(false);
  const change = useRef(onChange);
  useEffect(() => {
    change.current = onChange;
  }, [onChange]);
  const selection = JSON.stringify(references);
  const active = useCallback(
    () =>
      mounted.current &&
      focused.current &&
      connected.current &&
      document.visibilityState !== "hidden",
    []
  );
  useEffect(() => {
    mounted.current = true;
    if (focused.current === null) focused.current = document.hasFocus();
    if (connected.current === null) connected.current = navigator.onLine;
    const invalidate = () => {
      sequence.current++;
    };
    const hide = () => {
      sequence.current++;
      setPreview(null);
      setBusy(false);
      pending.current = false;
      setMessage("");
    };
    const blur = () => {
      focused.current = false;
      hide();
    };
    const offline = () => {
      connected.current = false;
      hide();
    };
    const refresh = async () => {
      if (!visible || !active() || pending.current) return;
      const seq = ++sequence.current;
      try {
        const { data } = await socialRequest<{ resources: PostResourceCard[] }>(
          `/api/platform/post-resources?${new URLSearchParams({ references: selection })}`,
          undefined,
          owner
        );
        if (seq === sequence.current && active())
          setPreview({ owner, selection, cards: data.resources });
      } catch {
        if (seq === sequence.current) setPreview(null);
      }
    };
    const focus = () => {
      focused.current = true;
      void refresh();
    };
    const change = () => {
      setPreview(null);
      sequence.current++;
      pending.current = false;
      setBusy(false);
      void refresh();
    };
    const online = () => {
      connected.current = true;
      change();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? blur() : focus();
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    window.addEventListener("blur", blur);
    window.addEventListener("pagehide", blur);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", focus);
    window.addEventListener("pageshow", focus);
    window.addEventListener("online", online);
    window.addEventListener("social-relationships-changed", change);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      setPreview(null);
      mounted.current = false;
      invalidate();
      pending.current = false;
      setBusy(false);
      clearInterval(timer);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pagehide", blur);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pageshow", focus);
      window.removeEventListener("online", online);
      window.removeEventListener("social-relationships-changed", change);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [owner, selection, visible, active]);
  async function add() {
    if (busy || !active() || !visible) return;
    const seq = ++sequence.current;
    setBusy(true);
    pending.current = true;
    setMessage("");
    try {
      if (references.length >= 3)
        throw new Error("Choose up to three resource cards.");
      const candidate = referenceFromUrl(url);
      if (references.some((r) => key(r) === key(candidate)))
        throw new Error("That resource is already attached.");
      const { data } = await socialRequest<{ resources: PostResourceCard[] }>(
        `/api/platform/post-resources?${new URLSearchParams({ references: JSON.stringify([candidate]) })}`,
        undefined,
        owner
      );
      if (seq !== sequence.current || !active()) return;
      if (!data.resources.some((r) => key(r) === key(candidate)))
        throw new Error(
          "This resource is unavailable. Choose another page you can currently read."
        );
      setBusy(false);
      change.current([...references, candidate]);
      setUrl("");
      setMessage("Resource card added. Save your draft or post to keep it.");
    } catch (error) {
      if (seq === sequence.current && active())
        setMessage(
          error instanceof Error
            ? error.message
            : "The resource could not be checked."
        );
    } finally {
      if (seq === sequence.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  const cards =
    visible && preview?.owner === owner && preview.selection === selection
      ? preview.cards
      : [];
  return (
    <fieldset
      className="space-y-2 rounded-xl border border-gc-border p-3"
      disabled={busy}
    >
      <legend className="px-1 font-semibold">Resource cards</legend>
      <p className="text-sm text-gc-muted">
        Attach up to three listings, events or volunteer opportunities. Copy the
        page link from this website. Each card uses current source details and
        permissions.
      </p>
      {references.length > 0 && (
        <ul className="space-y-2">
          {references.map((r, index) => {
            const card = cards.find((c) => key(c) === key(r));
            return (
              <li
                key={key(r)}
                className="flex items-center justify-between gap-2"
              >
                <span>
                  {card
                    ? `${labels[r.kind]}: ${card.title} (${card.state})`
                    : `${labels[r.kind]} card ${index + 1}: details unavailable until access is checked`}
                </span>
                <button
                  type="button"
                  className="min-h-11 shrink-0 underline"
                  aria-label={`Remove resource card ${index + 1}`}
                  onClick={() =>
                    onChange(references.filter((_, i) => i !== index))
                  }
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {references.length < 3 && (
        <>
          <label htmlFor={id} className="block font-semibold">
            Resource page link
          </label>
          <input
            id={id}
            type="text"
            inputMode="url"
            className={portalInputClass}
            value={url}
            maxLength={2048}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            type="button"
            className="min-h-11 underline"
            disabled={!url.trim() || busy}
            onClick={() => void add()}
          >
            {busy ? "Checking resource…" : "Add resource card"}
          </button>
        </>
      )}
      <p className="text-sm text-gc-muted">
        A card cannot widen its source audience. Changing the post audience
        requires confirmation, and unavailable cards stay hidden from readers.
        Removing or replacing a card on a published post adds its existing
        Edited label.
      </p>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </fieldset>
  );
}
