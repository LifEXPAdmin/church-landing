"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  currentSocialOwner,
  socialRequest,
  SocialClientError
} from "@/lib/platform/social-client";
import type {
  AdultMessageItem,
  AdultMessageView
} from "@/lib/platform/adult-message-types";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";

type Position = { before?: string; after?: string; around?: string };
export function useMessageWorkspace(
  owner: string,
  conversationId?: string,
  archived = false,
  inboxAfter?: string,
  selected?: string
) {
  const [state, setState] = useState({
    data: null as AdultMessageView | null,
    hidden: true,
    loading: false,
    busy: false,
    text: "",
    pending: null as string | null,
    conflict: false,
    waitingUntil: 0,
    readError: "",
    notice: "Checking private messages…"
  });
  const current = useRef(state);
  current.current = state;
  const generation = useRef(0),
    reading = useRef(false),
    writing = useRef(false),
    refreshQueued = useRef(false),
    queuedPosition = useRef<Position | undefined>(undefined),
    position = useRef<Position>(selected ? { around: selected } : {}),
    active = useRef(true);
  const readReceipt = useRef<{ body: string; sequence: number } | null>(null),
    readRetry = useRef({ at: 0, delay: 15000 }),
    visibleRead = useRef<AdultMessageItem | null>(null),
    readSaving = useRef(false);
  const atBottom = useRef(true);
  useUnsavedSocialWork(
    {
      dirty: !!state.text,
      saving: !!state.pending || state.busy,
      conflict: state.conflict
    },
    () =>
      setState((s) => ({
        ...s,
        notice: "Send, retry or discard your unsent work before leaving."
      })),
    true
  );

  const load = useCallback(
    async (next?: Position) => {
      if (!active.current || document.visibilityState === "hidden") return;
      if (reading.current || writing.current) {
        refreshQueued.current = true;
        if (next) queuedPosition.current = next;
        return;
      }
      reading.current = true;
      const seq = generation.current,
        previous = current.current.data;
      if (next) position.current = next;
      const catchup =
        !next &&
        !Object.keys(position.current).length &&
        previous?.messages?.at(-1);
      const q = new URLSearchParams(
        conversationId
          ? {
              view: "conversation",
              conversationId,
              ...position.current,
              ...(catchup ? { after: catchup.id } : {}),
              ...(matchMedia("(min-width: 1024px)").matches
                ? { inbox: "true", ...(archived ? { archived: "true" } : {}) }
                : {})
            }
          : {
              view: "inbox",
              ...(archived ? { archived: "true" } : {}),
              ...(inboxAfter ? { after: inboxAfter } : {})
            }
      );
      setState((s) => ({ ...s, loading: true }));
      try {
        const { data } = await socialRequest<AdultMessageView>(
          `/api/platform/messages?${q}`,
          undefined,
          owner
        );
        if (seq !== generation.current) return;
        if (catchup && previous?.messages && data.conversation) {
          const kept = previous.messages.filter(
            (m) => m.sequence > data.conversation!.preferences.hiddenThrough
          );
          if (atBottom.current) {
            data.messages = [
              ...new Map(
                [...kept, ...(data.messages ?? [])].map((m) => [m.id, m])
              ).values()
            ]
              .sort((a, b) => a.sequence - b.sequence)
              .slice(-100);
            data.older =
              data.messages[0]?.sequence >
              data.conversation.preferences.hiddenThrough + 1
                ? data.messages[0].id
                : null;
          } else {
            data.newer = data.messages?.length ? kept.at(-1)?.id : data.newer;
            data.messages = kept;
            data.older = previous.older;
          }
        }
        setState((s) => ({
          ...s,
          data,
          hidden: false,
          readError: "",
          notice: s.notice === "Checking private messages…" ? "" : s.notice
        }));
        return true;
      } catch (error) {
        if (seq !== generation.current) return;
        const identity = await currentSocialOwner().catch(() => null);
        if (seq !== generation.current) return;
        setState((s) => ({
          ...s,
          data: null,
          hidden: identity !== owner,
          readError:
            error instanceof Error
              ? error.message
              : "Messages could not be checked. Your unsent text is kept."
        }));
        return false;
      } finally {
        reading.current = false;
        if (seq === generation.current)
          setState((s) => ({ ...s, loading: false }));
        if (refreshQueued.current && !writing.current && active.current) {
          refreshQueued.current = false;
          const next = queuedPosition.current;
          queuedPosition.current = undefined;
          void load(next);
        }
      }
    },
    [owner, conversationId, archived, inboxAfter]
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>,
      delay = 15000;
    const poll = async () => {
      clearTimeout(timer);
      const ok = await load();
      delay = ok ? 15000 : Math.min(delay * 2, 120000);
      if (active.current) timer = setTimeout(poll, delay);
    };
    const hide = () => {
      active.current = false;
      generation.current++;
      clearTimeout(timer);
      // Keep only this mounted owner's in-memory cursor/history concealed.
      // A fresh authorized read is required before it can be rendered again.
      setState((s) => ({ ...s, hidden: true, loading: false }));
    };
    const resume = () => {
      if (document.visibilityState !== "hidden") {
        active.current = true;
        void poll();
      }
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : resume();
    active.current = true;
    const layout = matchMedia("(min-width: 1024px)");
    layout.addEventListener("change", resume);
    void poll();
    window.addEventListener("blur", hide);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("social-relationships-changed", resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      layout.removeEventListener("change", resume);
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("social-relationships-changed", resume);
      document.removeEventListener("visibilitychange", visibility);
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
    const s = current.current;
    if (writing.current || s.hidden || s.waitingUntil) return;
    writing.current = true;
    const seq = ++generation.current,
      input = JSON.parse(body);
    setState((v) => ({
      ...v,
      busy: true,
      pending: body,
      notice: input.operation === "send" ? "Sending…" : "Saving your choice…"
    }));
    try {
      const { data } = await socialRequest<{
        id: string;
        version: number;
        message: string;
      }>("/api/platform/messages", body, owner);
      if (seq !== generation.current) return;
      if (!data.id || !Number.isSafeInteger(data.version) || data.version < 1)
        throw new SocialClientError(
          503,
          "The result is unconfirmed. Retry the same action."
        );
      setState((v) => ({
        ...v,
        pending: null,
        conflict: false,
        text: input.operation === "send" ? "" : v.text,
        notice:
          input.operation === "send"
            ? "Sent — saved in this conversation."
            : data.message
      }));
      if (input.operation === "clear" || input.operation === "send")
        position.current = {};
      window.dispatchEvent(new Event("messages-changed"));
      refreshQueued.current = true;
    } catch (error) {
      if (seq !== generation.current) return;
      const status = error instanceof SocialClientError ? error.status : 503;
      setState((v) => ({
        ...v,
        pending: [400, 403, 404, 409, 429].includes(status) ? null : body,
        conflict: status === 409,
        hidden: status === 401 || v.hidden,
        data: [401, 403, 404, 409].includes(status) ? null : v.data,
        waitingUntil:
          error instanceof SocialClientError && error.retryAfter
            ? Date.now() + Math.min(error.retryAfter, 86400) * 1000
            : v.waitingUntil,
        notice:
          error instanceof Error
            ? error.message
            : "The response was lost. Retry the same action."
      }));
    } finally {
      writing.current = false;
      setState((v) => ({ ...v, busy: false }));
      if (refreshQueued.current) {
        refreshQueued.current = false;
        const next =
          input.operation === "clear" || input.operation === "send"
            ? {}
            : queuedPosition.current;
        queuedPosition.current = undefined;
        void load(next);
      }
    }
  }
  const act = (operation: string, fields: Record<string, unknown> = {}) =>
    void send(
      JSON.stringify({
        operation,
        mutationId: crypto.randomUUID(),
        ...(conversationId ? { conversationId } : {}),
        ...fields
      })
    );
  function discard() {
    if (
      current.current.pending &&
      !confirm(
        "This action may already be saved. Clear this browser’s retry and check the conversation before sending again?"
      )
    )
      return;
    setState((s) => ({
      ...s,
      text: "",
      pending: null,
      conflict: false,
      notice: s.pending
        ? "Local retry cleared. Check saved history before sending again."
        : "Unsent text discarded."
    }));
    void load({});
  }
  const markVisible = useCallback((message: AdultMessageItem) => {
    if (!active.current || current.current.hidden) return;
    if (!visibleRead.current || message.sequence > visibleRead.current.sequence)
      visibleRead.current = message;
  }, []);
  useEffect(() => {
    if (!conversationId || state.hidden) return;
    const save = async () => {
      const seen = visibleRead.current,
        s = current.current;
      if (
        !active.current ||
        s.hidden ||
        readSaving.current ||
        Date.now() < readRetry.current.at ||
        writing.current ||
        s.pending ||
        !seen ||
        seen.sequence <= (s.data?.conversation?.preferences.readThrough ?? 0)
      )
        return;
      readSaving.current = true;
      const receipt = readReceipt.current ?? {
        body: JSON.stringify({
          operation: "read",
          mutationId: crypto.randomUUID(),
          conversationId,
          through: seen.id
        }),
        sequence: seen.sequence
      };
      readReceipt.current = receipt;
      const seq = generation.current;
      try {
        const { data } = await socialRequest<{ version: number }>(
          "/api/platform/messages",
          receipt.body,
          owner
        );
        if (seq !== generation.current) return;
        readReceipt.current = null;
        readRetry.current = { at: 0, delay: 15000 };
        setState((v) =>
          v.data?.conversation
            ? {
                ...v,
                data: {
                  ...v.data,
                  conversation: {
                    ...v.data.conversation,
                    preferences: {
                      ...v.data.conversation.preferences,
                      version: Math.max(
                        v.data.conversation.preferences.version,
                        data.version
                      ),
                      readThrough: Math.max(
                        v.data.conversation.preferences.readThrough,
                        receipt.sequence
                      )
                    }
                  }
                }
              }
            : v
        );
        window.dispatchEvent(new Event("messages-changed"));
      } catch (error) {
        readRetry.current = {
          at: Date.now() + readRetry.current.delay,
          delay: Math.min(readRetry.current.delay * 2, 120000)
        };
        if (
          error instanceof SocialClientError &&
          error.status === 401 &&
          seq === generation.current
        ) {
          generation.current++;
          setState((v) => ({ ...v, hidden: true, data: null }));
        }
        if (
          error instanceof SocialClientError &&
          [400, 403, 404, 409].includes(error.status)
        )
          readReceipt.current = null;
      } finally {
        readSaving.current = false;
      }
    };
    const timer = setInterval(() => void save(), 3000);
    return () => clearInterval(timer);
  }, [owner, conversationId, state.hidden]);
  return { state, setState, load, send, act, discard, markVisible, atBottom };
}
