"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import type { ReactionPreferencesState } from "@/lib/platform/reaction-preferences";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";

export function ReactionPreferences({
  owner: currentOwner
}: {
  owner: string;
}) {
  const owner = useRef(currentOwner).current;
  const [state, setState] = useState({
    saved: null as ReactionPreferencesState | null,
    draft: false,
    dirty: false,
    conflict: false,
    pending: null as string | null,
    reviewedPending: false,
    visible: false,
    busy: false,
    message: "Checking your reaction-count choice…"
  });
  const current = useRef(state),
    generation = useRef(0),
    flight = useRef(false);
  const permitted = useRef(false),
    sourceMatches = useRef(currentOwner === owner);
  current.current = state;
  useUnsavedSocialWork(
    {
      dirty: state.dirty,
      saving: state.busy || !!state.pending,
      conflict: state.conflict
    },
    () =>
      setState((s) => ({
        ...s,
        message:
          "Save, confirm or discard your local reaction-count choice before leaving."
      })),
    true
  );
  const request = useCallback(
    async (body?: string) => {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 10000);
      try {
        const response = await fetch("/api/platform/reaction-preferences", {
          method: body ? "POST" : "GET",
          credentials: "same-origin",
          cache: "no-store",
          signal: abort.signal,
          headers: {
            "X-Expected-Account": owner,
            ...(body ? { "Content-Type": "application/json" } : {})
          },
          ...(body ? { body } : {})
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.message ??
              "Your choice could not be confirmed. Keep your local change."
          );
        if (
          body &&
          (data.id !== owner ||
            !Number.isSafeInteger(data.version) ||
            data.version < 1)
        )
          throw new Error(
            "The saved request could not be confirmed. Keep the original change and retry it."
          );
        if (
          !body &&
          (data.ownerId !== owner ||
            typeof data.hideAuthoredReactionCounts !== "boolean" ||
            !Number.isSafeInteger(data.version) ||
            data.version < 0 ||
            typeof data.recoveryRequired !== "boolean")
        )
          throw new Error(
            "Your current choice could not be checked. Keep your local change."
          );
        return data as ReactionPreferencesState;
      } catch (error) {
        if (abort.signal.aborted)
          throw new Error(
            "The response could not be confirmed. Reconnect and retry the same change."
          );
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
    [owner]
  );
  const active = useCallback(
    (seq: number) =>
      sourceMatches.current &&
      seq === generation.current &&
      document.hasFocus() &&
      document.visibilityState !== "hidden" &&
      navigator.onLine,
    []
  );
  const conceal = useCallback(() => {
    generation.current++;
    permitted.current = false;
    setState((s) => ({ ...s, visible: false }));
  }, []);
  const load = useCallback(async () => {
    conceal();
    if (
      flight.current ||
      !sourceMatches.current ||
      !document.hasFocus() ||
      !navigator.onLine ||
      document.visibilityState === "hidden"
    )
      return;
    const seq = generation.current;
    try {
      const data = await request();
      if (!active(seq)) return;
      permitted.current = true;
      setState((s) => ({
        ...s,
        saved: data,
        visible: true,
        reviewedPending: !!s.pending,
        draft: s.dirty || s.pending ? s.draft : data.hideAuthoredReactionCounts,
        conflict:
          s.conflict ||
          (!!s.saved &&
            (s.dirty || !!s.pending) &&
            s.saved.version !== data.version),
        message: s.pending
          ? "Confirm the original request or review the current saved choice before changing it."
          : s.dirty
            ? "Your unsaved choice is retained. Review any change saved elsewhere."
            : data.recoveryRequired
              ? "An older backup was restored. Totals stay hidden until you review and save this choice."
              : ""
      }));
    } catch (error) {
      if (active(seq))
        setState((s) => ({
          ...s,
          message:
            error instanceof Error
              ? error.message
              : "Reconnect to check your choice. Your local change is retained."
        }));
    }
  }, [active, conceal, request]);
  useLayoutEffect(() => {
    sourceMatches.current = currentOwner === owner;
    conceal();
    if (sourceMatches.current) void load();
    return conceal;
  }, [currentOwner, owner, load, conceal]);
  useEffect(() => {
    const restore = () => void load();
    const visibility = () =>
      document.visibilityState === "hidden" ? conceal() : restore();
    for (const event of ["blur", "offline", "pagehide"])
      window.addEventListener(event, conceal);
    for (const event of ["focus", "online", "pageshow"])
      window.addEventListener(event, restore);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      conceal();
      for (const event of ["blur", "offline", "pagehide"])
        window.removeEventListener(event, conceal);
      for (const event of ["focus", "online", "pageshow"])
        window.removeEventListener(event, restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [conceal, load]);
  async function save(retry = false) {
    const s = current.current;
    if (
      flight.current ||
      !permitted.current ||
      !active(generation.current) ||
      !s.saved ||
      (!retry && (s.pending || s.conflict))
    )
      return;
    const body = retry
      ? s.pending
      : JSON.stringify({
          mutationId: crypto.randomUUID(),
          expectedVersion: s.saved.version,
          hideAuthoredReactionCounts: s.draft
        });
    if (!body) return;
    const seq = generation.current;
    flight.current = true;
    setState((value) => ({
      ...value,
      pending: body,
      reviewedPending: false,
      busy: true,
      message: "Saving your choice…"
    }));
    try {
      const receipt = await request(body);
      if (!active(seq)) return;
      const data = await request();
      if (!active(seq)) return;
      if (
        data.version !== receipt.version ||
        data.hideAuthoredReactionCounts !==
          JSON.parse(body).hideAuthoredReactionCounts ||
        data.recoveryRequired
      ) {
        setState((value) => ({
          ...value,
          saved: data,
          reviewedPending: true,
          conflict: true,
          dirty: true,
          message:
            "Another saved change followed this request. Your original choice is retained. Review the current saved choice before continuing."
        }));
        return;
      }
      setState((value) => ({
        ...value,
        saved: data,
        draft: data.hideAuthoredReactionCounts,
        dirty: false,
        pending: null,
        conflict: false,
        message: "Your reaction-count choice is saved."
      }));
      window.dispatchEvent(new Event("social-relationships-changed"));
    } catch (error) {
      if (active(seq)) {
        conceal();
        setState((value) => ({
          ...value,
          message:
            error instanceof Error
              ? error.message
              : "The response was lost. Retry the same change."
        }));
      }
    } finally {
      flight.current = false;
      setState((value) => ({ ...value, busy: false }));
      if (
        !active(seq) &&
        sourceMatches.current &&
        document.hasFocus() &&
        navigator.onLine
      )
        void load();
    }
  }
  const visible = state.visible && currentOwner === owner;
  return (
    <section
      aria-labelledby="authored-reaction-count-heading"
      className="gc-settings space-y-3"
    >
      <h2 id="authored-reaction-count-heading" className="text-2xl">
        Totals on your contributions
      </h2>
      <p>
        This account choice applies to your personal posts and comments for
        everyone who can read them, including you. It does not change
        church-authored content, comment totals or anyone’s access.
      </p>
      <p>
        People can still Like, choose I prayed and see their own choice.
        Individually shared prayer names remain visible according to each
        person’s consent.
      </p>
      <div hidden={!visible} inert={!visible}>
        <label className="gc-setting-row">
          <span>Hide Like and prayer totals on my posts and comments</span>
          <input
            type="checkbox"
            checked={state.draft}
            disabled={state.busy || !!state.pending || state.conflict}
            onChange={(event) =>
              setState((s) => ({
                ...s,
                draft: event.target.checked,
                dirty:
                  event.target.checked !== s.saved?.hideAuthoredReactionCounts
              }))
            }
          />
        </label>
        <div className="flex flex-wrap gap-3">
          {!state.pending && (
            <button
              type="button"
              className="gc-button"
              disabled={
                state.busy ||
                state.conflict ||
                (!state.dirty && !state.saved?.recoveryRequired)
              }
              onClick={() => void save()}
            >
              Save contribution count choice
            </button>
          )}
          {state.pending && (
            <button
              type="button"
              className="gc-button"
              disabled={state.busy}
              onClick={() => void save(true)}
            >
              Retry same count choice
            </button>
          )}
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={state.busy}
            onClick={() => void load()}
          >
            Review current saved choice
          </button>
          {(state.dirty || state.pending || state.conflict) && state.saved && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={
                state.busy || (!!state.pending && !state.reviewedPending)
              }
              onClick={() =>
                setState((s) => ({
                  ...s,
                  draft: s.saved!.hideAuthoredReactionCounts,
                  dirty: false,
                  pending: null,
                  conflict: false,
                  message:
                    "Local change discarded. The current saved choice is shown."
                }))
              }
            >
              Discard local change and use saved choice
            </button>
          )}
        </div>
      </div>
      {!visible && (
        <button
          type="button"
          className="gc-button"
          disabled={state.busy}
          onClick={() => void load()}
        >
          Recheck count-choice access
        </button>
      )}
      <p role="status">
        {currentOwner !== owner
          ? "Return to the original account to continue this working copy."
          : state.message}
      </p>
    </section>
  );
}
