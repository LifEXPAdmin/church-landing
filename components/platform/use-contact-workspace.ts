"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  currentSocialOwner,
  socialRequest,
  SocialClientError
} from "@/lib/platform/social-client";
import type {
  ContactAudience,
  ContactPreference,
  ContactView
} from "@/lib/platform/adult-contact-types";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";

export function useContactWorkspace(owner: string, query: string) {
  const [state, setState] = useState({
    data: null as ContactView | null,
    hidden: true,
    busy: false,
    purpose: "",
    choice: null as ContactAudience | null,
    saved: null as ContactPreference | null,
    latest: null as ContactPreference | null,
    pending: null as string | null,
    conflict: false,
    receiptId: null as string | null,
    waitingUntil: 0,
    message: "Checking private contact access…"
  });
  const generation = useRef(0),
    inFlight = useRef(false),
    refreshQueued = useRef(false);
  const dirty =
    !!state.purpose ||
    (!!state.choice && state.choice !== state.saved?.audience);
  useUnsavedSocialWork(
    { dirty, saving: !!state.pending, conflict: state.conflict },
    () => {
      setState((s) => ({
        ...s,
        message: "Save, retry or discard your unsent entries before leaving."
      }));
    },
    true
  );
  const load = useCallback(async () => {
    if (inFlight.current) {
      refreshQueued.current = true;
      return;
    }
    const seq = ++generation.current;
    setState((s) => ({ ...s, hidden: true, busy: true }));
    try {
      const { data } = await socialRequest<ContactView>(
        `/api/platform/contact-requests?${query}`,
        undefined,
        owner
      );
      if (seq !== generation.current) return;
      setState((s) => {
        const keep =
          !!s.pending ||
          (!!s.choice && s.choice !== s.saved?.audience) ||
          s.conflict;
        const changed =
          !!data.preferences &&
          keep &&
          data.preferences.version !== s.saved?.version;
        return {
          ...s,
          data,
          hidden: false,
          saved: keep ? s.saved : (data.preferences ?? s.saved),
          choice: keep ? s.choice : (data.preferences?.audience ?? s.choice),
          latest: keep ? (data.preferences ?? s.latest) : null,
          conflict: data.preferences
            ? s.conflict || (changed && !s.pending)
            : false,
          message: s.pending
            ? "The previous response is unconfirmed. Retry the same action to check it."
            : changed
              ? "Contact choices changed elsewhere. Your selections are kept; review or discard them."
              : s.message === "Checking private contact access…"
                ? ""
                : s.message
        };
      });
    } catch (error) {
      if (seq !== generation.current) return;
      const current = await currentSocialOwner().catch(() => null);
      if (seq !== generation.current) return;
      setState((s) => ({
        ...s,
        data: null,
        hidden: current !== owner,
        message:
          error instanceof Error
            ? error.message
            : "Contact access could not be checked. Your entries are kept."
      }));
    } finally {
      if (seq === generation.current) setState((s) => ({ ...s, busy: false }));
    }
  }, [owner, query]);
  useEffect(() => {
    void load();
    const conceal = () => {
      generation.current++;
      setState((s) => ({ ...s, hidden: true, data: null }));
    };
    const restore = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? conceal() : restore();
    window.addEventListener("blur", conceal);
    window.addEventListener("focus", restore);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("social-relationships-changed", restore);
    return () => {
      conceal();
      refreshQueued.current = false;
      window.removeEventListener("blur", conceal);
      window.removeEventListener("focus", restore);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("social-relationships-changed", restore);
    };
  }, [load]);
  useEffect(() => {
    if (!state.waitingUntil) return;
    const timer = setTimeout(
      () => setState((s) => ({ ...s, waitingUntil: 0 })),
      Math.max(0, state.waitingUntil - Date.now())
    );
    return () => clearTimeout(timer);
  }, [state.waitingUntil]);
  async function send(body: string) {
    if (inFlight.current || state.hidden || state.waitingUntil) return;
    inFlight.current = true;
    const seq = generation.current,
      input = JSON.parse(body);
    setState((s) => ({
      ...s,
      pending: body,
      busy: true,
      message: "Saving this contact action…"
    }));
    try {
      const { data } = await socialRequest<{
        id: string;
        version: number;
        message: string;
      }>("/api/platform/contact-requests", body, owner);
      if (seq !== generation.current) return;
      if (!data.id || !Number.isSafeInteger(data.version) || data.version < 1)
        throw new SocialClientError(
          503,
          "The response could not be confirmed. Retry the same contact action."
        );
      setState((s) => ({
        ...s,
        pending: null,
        conflict: false,
        latest: null,
        ...(input.operation === "create"
          ? { purpose: "", receiptId: data.id }
          : {}),
        ...(input.operation === "preferences"
          ? {
              choice: input.audience,
              saved: { audience: input.audience, version: data.version }
            }
          : {}),
        message: data.message
      }));
      refreshQueued.current = true;
    } catch (error) {
      if (seq !== generation.current) return;
      const status = error instanceof SocialClientError ? error.status : 503;
      setState((s) => ({
        ...s,
        // An identity change can be detected after the server committed. Keep
        // the exact receipt key concealed until this owner signs back in.
        pending: [400, 403, 404, 409, 429].includes(status) ? null : body,
        conflict: status === 409,
        data: [403, 404, 409].includes(status) ? null : s.data,
        hidden: status === 401 || s.hidden,
        waitingUntil:
          error instanceof SocialClientError && error.retryAfter
            ? Date.now() + Math.min(14 * 86400, error.retryAfter) * 1000
            : s.waitingUntil,
        message:
          error instanceof Error
            ? error.message
            : "The response was lost. Retry the same contact action."
      }));
    } finally {
      inFlight.current = false;
      setState((s) => ({ ...s, busy: false }));
      if (refreshQueued.current) {
        refreshQueued.current = false;
        void load();
      }
    }
  }
  function discard() {
    if (
      state.pending &&
      !window.confirm(
        "This action may already have been saved. Clear this browser's retry and check the saved request or preferences before trying again?"
      )
    )
      return;
    setState((s) => ({
      ...s,
      purpose: "",
      pending: null,
      conflict: false,
      choice: (s.latest ?? s.saved)?.audience ?? null,
      saved: s.latest ?? s.saved,
      latest: null,
      message: s.pending
        ? "Local retry cleared. Check the saved state before submitting again."
        : "Unsent entries discarded."
    }));
  }
  const act = (operation: string, fields: Record<string, unknown> = {}) =>
    void send(
      JSON.stringify({ operation, mutationId: crypto.randomUUID(), ...fields })
    );
  return { state, setState, dirty, load, send, act, discard };
}
