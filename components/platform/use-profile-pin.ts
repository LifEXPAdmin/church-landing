"use client";
import { useCallback, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { useDraftController } from "./draft-workspace-provider";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import { usePrivateRecovery } from "./private-snapshot-guard";
type PinState = {
  pinned: boolean;
  replaces: boolean;
  canPin: boolean;
  version: number;
};

// The menu owner retains request bytes even when its popover closes or conceals.
// Status is read only when an eligible owner opens the menu, not for every card.
export function useProfilePin(
  postId: string,
  owner: string,
  eligible: boolean
) {
  const router = useRouter(),
    controller = useDraftController();
  const [state, setState] = useState<PinState | null>(null),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [message, setMessage] = useState("");
  const flight = useRef(false);
  const recoveryId = useId(),
    retryRef = useRef<() => void>(() => {});
  retryRef.current = () => {
    if (pending) void send(pending);
  };
  const retryOriginal = useCallback(() => retryRef.current(), []);
  usePrivateRecovery(recoveryId, !!pending, busy, retryOriginal);
  useUnsavedSocialWork(
    { dirty: false, saving: !!pending, conflict: false },
    () => setMessage("Confirm your pending profile pin before leaving.")
  );
  const path = `/api/platform/profile-pin?postId=${encodeURIComponent(postId)}`;
  async function load() {
    if (!eligible || flight.current || pending) return;
    flight.current = true;
    setBusy(true);
    setState(null);
    try {
      const result = await socialRequest<PinState>(path, undefined, owner);
      setState(result.data);
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Your profile pin could not be checked."
      );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  async function send(retry?: string) {
    if (!eligible || flight.current || (!retry && !state)) return;
    if (!retry) {
      const work = controller.getSnapshot();
      if (
        work.dirty ||
        work.saving ||
        work.conflict ||
        work.retry ||
        work.externalWork.dirty ||
        work.externalWork.saving ||
        work.externalWork.conflict
      ) {
        setMessage(
          "Save or resolve your unsent work before changing profile placement."
        );
        return;
      }
    }
    const body =
      retry ??
      JSON.stringify({
        postId,
        desired: !state!.pinned,
        expectedVersion: state!.version,
        mutationId: crypto.randomUUID()
      });
    flight.current = true;
    setBusy(true);
    setPending(body);
    try {
      const result = await socialRequest<{ message: string }>(
        "/api/platform/profile-pin",
        body,
        owner
      );
      setPending(null);
      const current = await socialRequest<PinState>(path, undefined, owner);
      setState(current.data);
      setMessage(result.data.message);
      router.refresh();
    } catch (error) {
      const status = error instanceof SocialClientError ? error.status : 503;
      if ([400, 401, 403, 404, 409, 429].includes(status)) setPending(null);
      setState(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "The response was lost. Retry the same profile pin choice."
      );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  return { state, busy, pending, message, load, send };
}
