"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { readExchangeDefaults } from "@/lib/platform/exchange-defaults";
import {
  currentSocialOwner,
  socialRequest,
  SocialClientError
} from "@/lib/platform/social-client";
import { ExchangeDefaultsForm } from "./exchange-defaults-form";
import { ReadVisibility } from "./read-visibility";

type Snapshot = Awaited<ReturnType<typeof readExchangeDefaults>>;
const checking = "Checking your current personal defaults access…";

// Retain one command owner through concealment and uncertain saves. The server
// sends only its identity; private defaults arrive in a current account read.
export function ExchangeDefaultsEntry({ owner }: { owner: string }) {
  const [page, setPage] = useState<Snapshot | null>(null);
  const [visible, setVisible] = useState(false);
  const [currentAccess, setCurrentAccess] = useState(false);
  const [notice, setNotice] = useState(checking);
  const [changedAccount, setChangedAccount] = useState(false);
  const snapshot = useRef<Snapshot | null>(null),
    confirmed = useRef<number | null>(null);
  const generation = useRef(0),
    identityGeneration = useRef(0);
  const active = useRef(false),
    changed = useRef(false),
    reading = useRef(false),
    queued = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef<() => Promise<void>>(async () => {});
  const hide = useCallback(() => {
    active.current = false;
    queued.current = false;
    generation.current++;
    setVisible(false);
    setCurrentAccess(false);
    if (!changed.current) setNotice(checking);
  }, []);
  const clearAccount = useCallback(() => {
    changed.current = true;
    snapshot.current = null;
    confirmed.current = null;
    identityGeneration.current++;
    hide();
    setPage(null);
    setChangedAccount(true);
    setNotice(
      "Your sign-in changed. Private entries were cleared. Reload for your current account."
    );
  }, [hide]);
  const load = useCallback(async () => {
    if (
      !active.current ||
      changed.current ||
      document.visibilityState === "hidden" ||
      navigator.onLine === false
    )
      return;
    const seq = ++generation.current;
    const identity = ++identityGeneration.current;
    setVisible(false);
    setCurrentAccess(false);
    setNotice(checking);
    if (reading.current) {
      queued.current = true;
      return;
    }
    reading.current = true;
    queued.current = false;
    const request = new AbortController();
    controller.current = request;
    const deadline = setTimeout(() => request.abort(), 15000);
    try {
      const { data } = await socialRequest<Snapshot>(
        "/api/platform/exchange?view=defaults",
        undefined,
        owner,
        "POST",
        undefined,
        request.signal
      );
      if (
        data.ownerId !== owner ||
        !Number.isInteger(data.version) ||
        data.version < 0 ||
        !data.fields ||
        typeof data.fields.pickupDetails !== "string" ||
        !Array.isArray(data.churches) ||
        typeof data.available !== "boolean" ||
        typeof data.recoveryRequired !== "boolean"
      )
        throw Error(
          "Current personal defaults could not be confirmed. Try again."
        );
      if (seq !== generation.current || !active.current) return;
      setCurrentAccess(true);
      const prior = snapshot.current;
      const changedDefaults =
        prior &&
        (data.version !== prior.version ||
          JSON.stringify(data.fields) !== JSON.stringify(prior.fields) ||
          data.recoveryRequired !== prior.recoveryRequired);
      if (
        (confirmed.current !== null && data.version < confirmed.current) ||
        (changedDefaults && confirmed.current === null)
      ) {
        setNotice(
          "Your saved defaults changed. Your local entries are retained and concealed. Confirm any original save, then reload to review current choices."
        );
      } else {
        snapshot.current = data;
        confirmed.current = null;
        setPage(data);
        setVisible(true);
        setNotice("");
      }
    } catch (error) {
      if (seq === generation.current && active.current) {
        setNotice(
          request.signal.aborted
            ? "Your personal defaults access check timed out. Try again. Your entries are retained."
            : error instanceof Error
              ? error.message
              : "Current personal defaults access could not be confirmed."
        );
      }
      // A blur from the session owner conceals presentation but must not suppress
      // a fresh confirmation that this page belongs to a different account.
      if (error instanceof SocialClientError && error.status === 401) {
        const actual = await currentSocialOwner(request.signal).catch(
          () => undefined
        );
        if (
          identity === identityGeneration.current &&
          !changed.current &&
          actual !== undefined &&
          actual !== owner
        )
          clearAccount();
      }
    } finally {
      clearTimeout(deadline);
      request.abort();
      if (controller.current === request) controller.current = null;
      reading.current = false;
      if (queued.current && active.current && !changed.current) {
        queued.current = false;
        void latest.current();
      }
    }
  }, [owner, clearAccount]);
  latest.current = load;
  const recheck = useCallback(() => {
    if (
      document.visibilityState === "hidden" ||
      navigator.onLine === false ||
      changed.current
    )
      return;
    active.current = true;
    void load();
  }, [load]);
  useEffect(() => {
    const identity = identityGeneration,
      currentRead = controller;
    const refresh = () => {
      if (active.current) void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : recheck();
    if (document.hasFocus()) recheck();
    else hide();
    const timer = setInterval(refresh, 30000);
    for (const event of ["blur", "pagehide", "offline"])
      window.addEventListener(event, hide);
    for (const event of ["focus", "pageshow"])
      window.addEventListener(event, recheck);
    for (const event of ["online", "social-relationships-changed"])
      window.addEventListener(event, refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      identity.current++;
      currentRead.current?.abort();
      clearInterval(timer);
      for (const event of ["blur", "pagehide", "offline"])
        window.removeEventListener(event, hide);
      for (const event of ["focus", "pageshow"])
        window.removeEventListener(event, recheck);
      for (const event of ["online", "social-relationships-changed"])
        window.removeEventListener(event, refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [hide, load, recheck]);
  const onConfirmed = useCallback(
    (receipt: { version: number }) => {
      if (changed.current) return;
      confirmed.current = receipt.version;
      // Invalidate even an already-running read before it can adopt a pre-save
      // snapshot and reset the receipt. Its finally block drains the queued read.
      generation.current++;
      setVisible(false);
      setCurrentAccess(false);
      if (active.current) void load();
    },
    [load]
  );
  return (
    <section className="space-y-5" aria-label="Private personal defaults">
      {!visible && (
        <div className="space-y-3 rounded-xl border p-4">
          <p role="status">{notice}</p>
          {!changedAccount && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              onClick={recheck}
            >
              Recheck current access
            </button>
          )}
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              if (
                changedAccount ||
                confirm(
                  "Reload current saved defaults and discard local entries? An unconfirmed save may already be received."
                )
              )
                window.location.reload();
            }}
          >
            Reload current information
          </button>
        </div>
      )}
      <ReadVisibility.Provider value={visible}>
        {page && (
          <ExchangeDefaultsForm
            key={`${owner}:${page.version}`}
            initial={page}
            privacy={{ currentAccess, onAccessDenied: hide, onConfirmed }}
          />
        )}
      </ReadVisibility.Provider>
    </section>
  );
}
