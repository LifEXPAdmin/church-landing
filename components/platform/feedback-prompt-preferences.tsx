"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { socialRequest } from "@/lib/platform/social-client";
import type { FeedbackPromptState } from "@/lib/platform/feedback-prompt-policy";
import { useReadVisibility } from "./read-visibility";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
const endpoint = "/api/platform/feedback/prompts";
export function FeedbackPromptPreferences({ owner }: { owner: string }) {
  const visible = useReadVisibility();
  const [state, setState] = useState<FeedbackPromptState | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [pending, setPending] = useState<string | null>(null),
    generation = useRef(0);
  const load = useCallback(async () => {
    const seq = ++generation.current;
    setState(null);
    if (!visible) return;
    try {
      const { data } = await socialRequest<FeedbackPromptState>(
        endpoint,
        undefined,
        owner
      );
      if (seq === generation.current && data.ownerId === owner) setState(data);
    } catch {
      if (seq === generation.current)
        setNotice(
          "Prompt preferences could not be checked. Retry when connected."
        );
    }
  }, [visible, owner]);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    void load();
    window.addEventListener("feedback-preferences-changed", load);
    return () => {
      invalidate();
      window.removeEventListener("feedback-preferences-changed", load);
    };
  }, [load, invalidate]);
  useUnsavedSocialWork(
    { dirty: !!pending, saving: busy, conflict: false },
    () =>
      setNotice(
        "Your feedback preference is unconfirmed. Retry the same choice or check its current status."
      )
  );
  const save = async () => {
    if (busy || !visible) return;
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
