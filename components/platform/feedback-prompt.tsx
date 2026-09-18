"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { socialRequest } from "@/lib/platform/social-client";
import type { FeedbackPromptReservation } from "@/lib/platform/feedback-prompt-policy";
import { useDraftController } from "./draft-workspace-provider";
const endpoint = "/api/platform/feedback/prompts";
const channelName = "godschurches-feedback-prompts";

/** One small non-modal invitation. The same full form accepts every kind/rating. */
export function FeedbackPrompt({ owner }: { owner: string | null }) {
  const path = usePathname(),
    controller = useDraftController();
  const [claim, setClaim] = useState<FeedbackPromptReservation | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const sheet = useRef<HTMLElement>(null),
    closeButton = useRef<HTMLButtonElement>(null),
    priorFocus = useRef<HTMLElement | null>(null),
    live = useRef(true),
    generation = useRef(0),
    request = useRef<string | null>(null),
    channel = useRef<BroadcastChannel | null>(null),
    reserving = useRef(false);
  const quiet = useCallback(() => {
    const s = controller.getSnapshot();
    if (
      !owner ||
      path !== "/platform/menu" ||
      document.visibilityState !== "visible" ||
      !document.hasFocus() ||
      !navigator.onLine ||
      s.hidden ||
      s.ownerId !== owner ||
      s.dirty ||
      s.saving ||
      s.publishing ||
      s.failed ||
      s.conflict ||
      s.retry ||
      s.externalWork.dirty ||
      s.externalWork.saving ||
      s.externalWork.conflict
    )
      return false;
    if (
      [
        ...document.querySelectorAll<HTMLElement>(
          '[role="dialog"],dialog[open]'
        )
      ].some((el) => el !== sheet.current && el.getClientRects().length)
    )
      return false;
    if (
      [...document.querySelectorAll<HTMLElement>('[role="alert"]')].some(
        (el) => el.textContent?.trim() && el.getClientRects().length
      )
    )
      return false;
    const focused = document.activeElement;
    return !(
      focused instanceof Element &&
      focused.closest("input,textarea,select,[contenteditable=true],form")
    );
  }, [controller, owner, path]);
  const conceal = useCallback((restore = false) => {
    generation.current++;
    setClaim(null);
    setConfirmed(false);
    setBusy(false);
    if (restore) {
      const focus = priorFocus.current?.isConnected
        ? priorFocus.current
        : document.querySelector<HTMLElement>('a[href="/platform/menu"]');
      focus?.focus();
    }
  }, []);
  const save = useCallback(
    async (operation: "dismiss" | "never-ask") => {
      if (!owner || busy) return;
      request.current ??= JSON.stringify({
        operation,
        mutationId: crypto.randomUUID()
      });
      const body = request.current,
        seq = generation.current;
      setBusy(true);
      setNotice("");
      try {
        const { data } = await socialRequest<{ id: string; message: string }>(
          endpoint,
          body,
          owner
        );
        if (!live.current || seq !== generation.current) return;
        if (data.id !== owner)
          throw Error("Your sign-in changed. Check your feedback preferences.");
        request.current = null;
        setNotice(data.message);
        channel.current?.postMessage({ owner });
        window.dispatchEvent(new Event("feedback-preferences-changed"));
        conceal(true);
      } catch (error) {
        if (live.current && seq === generation.current)
          setNotice(
            error instanceof Error
              ? error.message
              : "The choice is unconfirmed. Retry the same choice."
          );
      } finally {
        if (live.current && seq === generation.current) setBusy(false);
      }
    },
    [owner, busy, conceal]
  );
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    live.current = true;
    const cancel = () => conceal();
    const visibility = () => {
      if (document.visibilityState !== "visible") conceal();
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offer = (event: Event) => {
      if ((event as CustomEvent).detail?.owner !== owner || reserving.current)
        return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (!quiet() || sheet.current) return;
        reserving.current = true;
        const seq = generation.current,
          claimId = crypto.randomUUID();
        try {
          const { data } = await socialRequest<{
            ownerId: string;
            claim: FeedbackPromptReservation | null;
          }>(
            endpoint,
            JSON.stringify({ operation: "reserve", claimId }),
            owner!
          );
          if (
            !live.current ||
            seq !== generation.current ||
            !quiet() ||
            data.ownerId !== owner ||
            !data.claim ||
            Date.parse(data.claim.expiresAt) <= Date.now()
          )
            return;
          priorFocus.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          request.current = null;
          setNotice("");
          setConfirmed(false);
          setClaim(data.claim);
        } catch {
          /* An optional invitation never interrupts an unavailable page. */
        } finally {
          reserving.current = false;
        }
      }, 900);
    };
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel(channelName);
      channel.current.onmessage = (event) => {
        if (event.data?.owner === owner) conceal();
      };
    }
    window.addEventListener("platform-quiet-navigation", offer);
    window.addEventListener("blur", cancel);
    window.addEventListener("offline", cancel);
    window.addEventListener("platform-measurement-changed", cancel);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      live.current = false;
      invalidate();
      clearTimeout(timer);
      channel.current?.close();
      channel.current = null;
      window.removeEventListener("platform-quiet-navigation", offer);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("offline", cancel);
      window.removeEventListener("platform-measurement-changed", cancel);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [owner, path, quiet, conceal, invalidate]);
  useEffect(() => {
    conceal();
  }, [path, owner, conceal]);
  useEffect(() => {
    if (!claim || !owner) return;
    let active = true,
      checking = false;
    const verify = async () => {
      if (checking || request.current) return;
      if (!quiet() || Date.now() >= Date.parse(claim.expiresAt)) {
        conceal(true);
        return;
      }
      checking = true;
      try {
        const { data } = await socialRequest<{
          ownerId: string;
          confirmed: boolean;
        }>(
          endpoint,
          JSON.stringify({ operation: "shown", claimId: claim.id }),
          owner
        );
        if (!active) return;
        if (data.ownerId !== owner || !data.confirmed || !quiet()) {
          conceal(true);
          return;
        }
        setConfirmed(true);
      } catch {
        if (active) conceal(true);
      } finally {
        checking = false;
      }
    };
    // The named sheet must have actually painted before recording an exposure.
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (active && sheet.current?.getClientRects().length) {
          closeButton.current?.focus();
          void verify();
        }
      })
    );
    const timer = setInterval(() => void verify(), 20000);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, [claim, owner, quiet, conceal]);
  useEffect(() => {
    if (!claim) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void save("dismiss");
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [claim, save]);
  return (
    <>
      {notice && (
        <p role="status" className="mx-auto max-w-xl px-4 py-2 text-sm">
          {notice}
        </p>
      )}
      {claim && (
        <section
          ref={sheet}
          role="dialog"
          aria-modal="false"
          aria-labelledby="feedback-prompt-title"
          className="fixed inset-x-3 top-24 z-[70] mx-auto max-h-[60dvh] max-w-md overflow-auto rounded-2xl border border-gc-divider bg-gc-canvas p-5 shadow-xl"
        >
          <div className="mb-2 flex justify-end">
            <button
              ref={closeButton}
              type="button"
              className="gc-button gc-button-quiet shrink-0"
              aria-label="Close feedback prompt"
              disabled={busy}
              onClick={() => void save("dismiss")}
            >
              Close
            </button>
          </div>
          <h2 id="feedback-prompt-title" className="font-serif text-xl">
            How is God’s Churches working for you?
          </h2>
          <p className="my-4 text-sm">
            Optional feedback about the website. Share a rating, describe a
            problem or suggest an improvement. You can continue without
            responding.
          </p>
          <div className="flex flex-wrap gap-3">
            {confirmed && !request.current && (
              <Link
                prefetch={false}
                className="gc-button gc-button-primary"
                href={`/platform/feedback?prompt=${encodeURIComponent(claim.id)}`}
              >
                Share feedback
              </Link>
            )}
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={busy || !!request.current}
              onClick={() => void save("never-ask")}
            >
              Don’t ask again
            </button>
            {request.current && !busy && (
              <button
                type="button"
                className="gc-button gc-button-primary"
                onClick={() => void save("dismiss")}
              >
                Retry the same choice
              </button>
            )}
          </div>
          <p className="mt-4 text-xs text-gc-muted">
            Closing pauses prompts for 30 days. Share feedback is always
            available in Menu.
          </p>
        </section>
      )}
    </>
  );
}
