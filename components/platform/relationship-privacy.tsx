"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
type Privacy = {
  version: number;
  mentions: "EVERYONE" | "FOLLOWED" | "NOBODY";
  showRelationships: boolean;
};
export function RelationshipPrivacy({ owner }: { owner: string }) {
  const router = useRouter();
  const [state, setState] = useState({
    saved: null as Privacy | null,
    fields: null as Privacy | null,
    latest: null as Privacy | null,
    dirty: false,
    hidden: true,
    busy: false,
    pending: null as string | null,
    conflict: false,
    message: ""
  });
  const current = useRef(state),
    generation = useRef(0),
    inFlight = useRef(false);
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
        message: "Save or resolve your privacy choices before leaving."
      }))
  );
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const seq = ++generation.current;
    setState((s) => ({ ...s, busy: true }));
    try {
      const { data } = await socialRequest<Privacy>(
        "/api/platform/relationships?view=privacy",
        undefined,
        owner
      );
      if (seq !== generation.current) return;
      setState((s) =>
        s.pending
          ? {
              ...s,
              hidden: false,
              message: "Retry the last request before changing these choices."
            }
          : s.dirty || s.conflict
            ? {
                ...s,
                hidden: false,
                latest: data,
                conflict: s.conflict || data.version !== s.saved?.version,
                message:
                  data.version !== s.saved?.version
                    ? "Privacy choices changed elsewhere. Your selections are preserved."
                    : "Your unsaved selections are preserved."
              }
            : {
                ...s,
                saved: data,
                fields: data,
                latest: null,
                hidden: false,
                conflict: false,
                message: ""
              }
      );
    } catch (e) {
      if (seq === generation.current) {
        if (e instanceof SocialClientError && e.status === 401) {
          setState((s) => ({
            ...s,
            saved: null,
            fields: null,
            latest: null,
            dirty: false,
            pending: null,
            conflict: false,
            hidden: true,
            message: "Your sign-in changed. Reload settings before continuing."
          }));
          router.refresh();
        } else
          setState((s) => ({
            ...s,
            message:
              e instanceof Error
                ? e.message
                : "Privacy choices could not be loaded."
          }));
      }
    } finally {
      if (seq === generation.current) {
        inFlight.current = false;
        setState((s) => ({ ...s, busy: false }));
      }
    }
  }, [owner, router]);
  useEffect(() => {
    void load();
    const conceal = () => {
      generation.current++;
      inFlight.current = false;
      setState((s) => ({ ...s, hidden: true, busy: false }));
    };
    const restore = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? conceal() : restore();
    window.addEventListener("blur", conceal);
    window.addEventListener("focus", restore);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      // Request-generation counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      window.removeEventListener("blur", conceal);
      window.removeEventListener("focus", restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load]);
  function change(patch: Partial<Privacy>) {
    setState((s) => {
      if (!s.fields || s.pending) return s;
      const fields = { ...s.fields, ...patch };
      return {
        ...s,
        fields,
        dirty:
          fields.mentions !== s.saved?.mentions ||
          fields.showRelationships !== s.saved?.showRelationships,
        message: "Privacy changes are not saved yet."
      };
    });
  }
  async function save() {
    const s = current.current;
    if (inFlight.current || s.hidden || !s.fields || !s.saved || s.conflict)
      return;
    inFlight.current = true;
    const seq = generation.current;
    const body =
      s.pending ??
      JSON.stringify({
        operation: "privacy",
        mutationId: crypto.randomUUID(),
        expectedVersion: s.saved.version,
        mentions: s.fields.mentions,
        showRelationships: s.fields.showRelationships
      });
    setState((v) => ({
      ...v,
      pending: body,
      busy: true,
      message: "Saving privacy choices…"
    }));
    try {
      const { data } = await socialRequest<{ version: number }>(
        "/api/platform/relationships",
        body,
        owner
      );
      if (seq !== generation.current) return;
      if (!Number.isSafeInteger(data.version) || data.version < 1)
        throw new SocialClientError(
          503,
          "The response could not be confirmed. Retry the same privacy choices."
        );
      const fields = { ...s.fields, version: data.version };
      setState((v) => ({
        ...v,
        saved: fields,
        fields,
        latest: null,
        pending: null,
        dirty: false,
        conflict: false,
        message: "Privacy choices saved."
      }));
      router.refresh();
    } catch (e) {
      if (seq === generation.current) {
        const status = e instanceof SocialClientError ? e.status : 503;
        setState((v) => ({
          ...v,
          pending: [400, 401, 403, 404, 409, 429].includes(status)
            ? null
            : body,
          conflict: status === 409,
          message:
            e instanceof Error
              ? e.message
              : "The response was lost. Retry the same privacy choices."
        }));
      }
    } finally {
      if (seq === generation.current) {
        inFlight.current = false;
        setState((v) => ({ ...v, busy: false }));
      }
    }
  }
  return (
    <section
      aria-label="Relationship privacy"
      className="gc-settings space-y-3"
    >
      <h2>Mention and connection privacy</h2>
      <p role="status">{state.message}</p>
      {state.hidden || !state.fields ? (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={state.busy}
          onClick={() => void load()}
        >
          Load privacy choices
        </button>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="block">
            Who may mention you
            <select
              aria-label="Who may mention you"
              className="ml-2 rounded border p-2"
              value={state.fields.mentions}
              disabled={state.busy || !!state.pending}
              onChange={(e) =>
                change({ mentions: e.target.value as Privacy["mentions"] })
              }
            >
              <option value="EVERYONE">Everyone eligible</option>
              <option value="FOLLOWED">People I follow</option>
              <option value="NOBODY">Nobody</option>
            </select>
          </label>
          <p className="text-sm text-gc-muted">
            People I follow means accounts you follow. Audience and block rules
            still apply.
          </p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={state.fields.showRelationships}
              disabled={state.busy || !!state.pending}
              onChange={(e) => change({ showRelationships: e.target.checked })}
            />
            Show relationship counts on my profile
          </label>
          <p className="text-sm text-gc-muted">
            Following does not reveal or grant private church membership.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="gc-button gc-button-primary"
              disabled={
                state.busy || state.conflict || (!state.dirty && !state.pending)
              }
            >
              {state.pending
                ? "Retry same privacy choices"
                : "Save privacy choices"}
            </button>
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={state.busy || !!state.pending}
              onClick={() => void load()}
            >
              Review saved privacy choices
            </button>
          </div>
          {state.latest && (
            <aside
              aria-label="Saved privacy choices"
              className="space-y-2 rounded border p-3"
            >
              <p>
                Saved mention choice:{" "}
                {state.latest.mentions === "FOLLOWED"
                  ? "People I follow"
                  : state.latest.mentions === "NOBODY"
                    ? "Nobody"
                    : "Everyone eligible"}
                . Relationship counts:{" "}
                {state.latest.showRelationships ? "shown" : "hidden"}.
              </p>
              <button
                type="button"
                className="gc-button gc-button-quiet"
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    saved: s.latest,
                    fields: s.latest,
                    latest: null,
                    dirty: false,
                    conflict: false,
                    message: "Saved privacy choices loaded."
                  }))
                }
              >
                Replace my selections with saved choices
              </button>
            </aside>
          )}
        </form>
      )}
    </section>
  );
}
