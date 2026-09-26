"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { socialRequest } from "@/lib/platform/social-client";
import type { FeedbackPromptState } from "@/lib/platform/feedback-prompt-policy";
import { useReadVisibility } from "./read-visibility";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
const endpoint = "/api/platform/feedback/prompts";
export function FeedbackPromptPreferences({ owner }: { owner: string }) {
  const visible = useReadVisibility();
  const visibleNow = useRef(visible),
    mounted = useRef(false);
  visibleNow.current = visible;
  const [state, setState] = useState<FeedbackPromptState | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [pending, setPending] = useState<string | null>(null),
    generation = useRef(0);
  const load = useCallback(async () => {
    if (!mounted.current) return;
    const seq = ++generation.current;
    setState(null);
    if (!visibleNow.current) return;
    try {
      const { data } = await socialRequest<FeedbackPromptState>(
        endpoint,
        undefined,
        owner
      );
      if (
        mounted.current &&
        visibleNow.current &&
        seq === generation.current &&
        data.ownerId === owner
      )
        setState(data);
    } catch {
      if (mounted.current && visibleNow.current && seq === generation.current)
        setNotice(
          "Prompt preferences could not be checked. Retry when connected."
        );
    }
  }, [owner]);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    window.addEventListener("feedback-preferences-changed", load);
    return () => {
      mounted.current = false;
      invalidate();
      window.removeEventListener("feedback-preferences-changed", load);
    };
  }, [load, invalidate, visible]);
  useUnsavedSocialWork(
    { dirty: !!pending, saving: busy, conflict: false },
    () =>
      setNotice(
        "Your feedback preference is unconfirmed. Retry the same choice or check its current status."
      )
  );
  const save = async () => {
    if (busy || !visibleNow.current) return;
    const body =
      pending ??
      JSON.stringify({
        operation: "never-ask",
        mutationId: crypto.randomUUID()
      });
    setPending(body);
    setBusy(true);
    try {
      const { data } = await socialRequest<{ id: string; message: string }>(
        endpoint,
        body,
        owner
      );
      if (data.id !== owner)
        throw Error("Your sign-in changed. Check the current account.");
      setPending(null);
      setNotice(data.message);
      await load();
      if (typeof BroadcastChannel !== "undefined") {
        const c = new BroadcastChannel("godschurches-feedback-prompts");
        c.postMessage({ owner });
        c.close();
      }
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The choice is unconfirmed. Retry the same choice."
      );
    } finally {
      setBusy(false);
    }
  };
  if (!visible) return null;
  return (
    <details className="rounded-xl border border-gc-divider p-4">
      <summary className="cursor-pointer py-2 font-semibold">
        Automatic feedback prompts
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm">
          Prompts are optional. Choosing “Don’t ask again” applies across your
          devices and future prompts. Share feedback remains available here.
        </p>
        {state?.neverAsk ? (
          <p>Automatic feedback prompts are off for your account.</p>
        ) : (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={busy || !state || !visible}
            onClick={() => void save()}
          >
            {pending ? "Retry the same preference" : "Don’t ask again"}
          </button>
        )}
        {!!pending && state?.neverAsk && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={busy || !visible}
            onClick={() => void save()}
          >
            Finish protecting this preference
          </button>
        )}
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={busy || !visible}
          onClick={() => void load()}
        >
          Check current prompt preference
        </button>
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
      </div>
    </details>
  );
}
