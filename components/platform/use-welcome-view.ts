"use client";
import { useEffect, useRef, useState } from "react";
import { useChurchRefresh } from "./use-church-refresh";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";

export function useWelcomeView<T extends { ownerId: string }>(
  url: string,
  ownerId: string,
  active = true
) {
  const [data, setData] = useState<T | null>(null),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false);
  const revision = useRef(0),
    savingRef = useRef(false),
    alive = useRef(true);
  const identity = url + "|" + ownerId,
    identityRef = useRef(identity);
  identityRef.current = identity;
  const pending = useRef<{ body: string; fingerprint: string } | null>(null);
  useUnsavedSocialWork(
    { dirty: false, saving: saving || !!pending.current, conflict: false },
    () => setMessage("Confirm or retry the pending change before leaving."),
    true
  );
  useEffect(() => {
    pending.current = null;
    setData(null);
  }, [ownerId]);
  const { refresh, pending: loading } = useChurchRefresh({
    url,
    revision: () => revision.current,
    paused: () => savingRef.current || !active,
    onData(value) {
      const next = value as T;
      if (next.ownerId !== ownerId) {
        setData(null);
        setMessage("Your sign-in changed. Reload before continuing.");
        return;
      }
      setData(next);
    },
    onUnavailable() {
      setData(null);
      setMessage(
        "Current access could not be confirmed. Reconnect and check again."
      );
    }
  });
  useEffect(() => {
    if (active) void refresh();
    else {
      revision.current++;
      setData(null);
    }
  }, [active, refresh]);
  useEffect(() => {
    alive.current = true;
    setData(null);
    const hide = () => {
      revision.current++;
      setData(null);
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") hide();
    };
    const changed = () => {
      hide();
      void refresh();
    };
    const invalidate = () => {
      revision.current++;
    };
    window.addEventListener("blur", hide);
    window.addEventListener("social-relationships-changed", changed);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      alive.current = false;
      invalidate();
      window.removeEventListener("blur", hide);
      window.removeEventListener("social-relationships-changed", changed);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [url, ownerId, refresh]);
  async function save(input: Record<string, unknown>) {
    if (savingRef.current) return false;
    const fingerprint = JSON.stringify(input);
    if (pending.current && pending.current.fingerprint !== fingerprint) {
      setMessage(
        "Retry the unconfirmed change before making a different choice."
      );
      return false;
    }
    pending.current ??= {
      fingerprint,
      body: JSON.stringify({ ...input, mutationId: crypto.randomUUID() })
    };
    savingRef.current = true;
    setSaving(true);
    revision.current++;
    const startedIdentity = identity;
    try {
      const result = await socialRequest<{ message: string }>(
        "/api/platform/church-tools",
        pending.current.body,
        ownerId
      );
      if (typeof result.data?.message !== "string")
        throw new SocialClientError(
          503,
          "The response could not be confirmed. Retry the same change."
        );
      if (!alive.current || identityRef.current !== startedIdentity)
        return false;
      pending.current = null;
      setMessage(result.data.message);
      return true;
    } catch (error) {
      if (!alive.current || identityRef.current !== startedIdentity)
        return false;
      // A definitive conflict/denial is safe to replace after a fresh read.
      if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        [400, 401, 403, 404, 409].includes(Number(error.status))
      )
        pending.current = null;
      setData(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "The change could not be confirmed. Retry when connected."
      );
      return false;
    } finally {
      savingRef.current = false;
      if (alive.current) {
        setSaving(false);
        if (identityRef.current === startedIdentity) await refresh();
      }
    }
  }
  return {
    data,
    message,
    saving,
    loading,
    save,
    refresh,
    unconfirmed: !!pending.current,
    retry: () =>
      pending.current
        ? save(JSON.parse(pending.current.fingerprint))
        : Promise.resolve(false)
  };
}
