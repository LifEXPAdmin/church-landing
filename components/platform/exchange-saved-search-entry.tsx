"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { readExchangeSaved } from "@/lib/platform/exchange-saved";
import type { PrivateChoiceAccess } from "./use-private-choice-action";
import {
  currentSocialOwner,
  socialRequest,
  SocialClientError
} from "@/lib/platform/social-client";
import { ExchangeSaveSearchForm } from "./exchange-saved-controls";
import { ReadVisibility, useReadVisibility } from "./read-visibility";

type Snapshot = Awaited<ReturnType<typeof readExchangeSaved>>;
type Receipt = Parameters<PrivateChoiceAccess["onConfirmed"]>[0];
type Search = NonNullable<Snapshot["searches"]>[number];
type Target = { id: string; expectedVersion: number };
function validPage(data: Snapshot, owner: string) {
  return (
    data.ownerId === owner &&
    Array.isArray(data.searches) &&
    data.searches.length <= 20 &&
    (data.after === null || typeof data.after === "string") &&
    data.searches.every(
      (row) =>
        typeof row.id === "string" &&
        !!row.id &&
        Number.isInteger(row.version) &&
        row.version >= 0 &&
        row.schema === 1 &&
        typeof row.name === "string" &&
        typeof row.alerts === "boolean" &&
        typeof row.href === "string" &&
        !!row.criteria &&
        typeof row.criteria === "object" &&
        !Array.isArray(row.criteria)
    )
  );
}
const checking = "Checking your current saved search access…";

// Keep one draft and command owner while physical private fields are concealed.
// The server sends only identifiers; current canonical reads initialize fields.
export function ExchangeSearchSaveEntry({
  owner,
  query,
  searchId
}: {
  owner: string;
  query: import("@/lib/platform/exchange-options").ExchangeSearchQuery;
  searchId?: string;
}) {
  const parentVisible = useReadVisibility();
  const receipt = useRef<Receipt | null>(null);
  const original = useRef<Target | null>(null);
  const [acceptedReceipt, setAcceptedReceipt] = useState<Receipt | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [confirmedUnavailable, setConfirmedUnavailable] = useState(false);
  // Undefined is uninitialized; null is an authorized blank new-search form.
  const [page, setPage] = useState<Search | null | undefined>(undefined);
  const [visible, setVisible] = useState(false);
  const [currentAccess, setCurrentAccess] = useState(false);
  const [notice, setNotice] = useState(checking);
  const [changedAccount, setChangedAccount] = useState(false);
  const snapshot = useRef<Search | null | undefined>(undefined);
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
    setConfirmedUnavailable(false);
    if (!changed.current) setNotice(checking);
  }, []);
  const clearAccount = useCallback(() => {
    changed.current = true;
    snapshot.current = undefined;
    receipt.current = null;
    original.current = null;
    setAcceptedReceipt(null);
    identityGeneration.current++;
    hide();
    setPage(undefined);
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
    setConfirmedUnavailable(false);
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
      const targetId = original.current?.id ?? searchId;
      const url = `/api/platform/exchange?${new URLSearchParams(
        targetId ? { view: "search", searchId: targetId } : { view: "searches" }
      )}`;
      const { data } = await socialRequest<Snapshot>(
        url,
        undefined,
        owner,
        "POST",
        undefined,
        request.signal
      );
      if (
        !validPage(data, owner) ||
        (targetId &&
          (data.searches!.length !== 1 || data.searches![0].id !== targetId))
      )
        throw Error("Current saved search could not be confirmed. Try again.");
      if (seq !== generation.current || !active.current) return;
      setCurrentAccess(true);
      setUnavailable(false);
      const row = targetId ? data.searches![0] : null;
      const prior = snapshot.current;
      const accepted = receipt.current;
      if (accepted) {
        if (
          !row ||
          row.id !== accepted.id ||
          row.version !== accepted.version
        ) {
          setNotice(
            row && row.version > accepted.version
              ? "The original save is confirmed, but this search changed again. Reload to review current information."
              : "The original save is confirmed. Recheck to read its current saved version."
          );
          return;
        }
        snapshot.current = searchId ? row : null;
        setPage(snapshot.current);
        setAcceptedReceipt(accepted);
        receipt.current = null;
        original.current = null;
      } else if (
        prior !== undefined &&
        JSON.stringify(row) !== JSON.stringify(prior)
      ) {
        setNotice(
          "Your saved search changed. The original entries are retained and concealed. Confirm any original save, then reload to review current information."
        );
        return;
      } else if (prior === undefined) {
        snapshot.current = row;
        setPage(row);
      }
      setVisible(true);
      setNotice("");
    } catch (error) {
      let failure = error;
      const missing =
        error instanceof SocialClientError && error.status === 404;
      if (seq === generation.current && active.current) {
        setUnavailable(missing);
        setNotice(
          request.signal.aborted
            ? "Your saved search check timed out. Try again. The original entries and request are retained."
            : error instanceof Error
              ? error.message
              : "Current saved search could not be confirmed."
        );
      }
      if (missing && original.current) {
        try {
          const { data } = await socialRequest<Snapshot>(
            "/api/platform/exchange?view=searches",
            undefined,
            owner,
            "POST",
            undefined,
            request.signal
          );
          if (!validPage(data, owner))
            throw Error("Current saved search access could not be confirmed.");
          if (
            seq === generation.current &&
            active.current &&
            !changed.current
          ) {
            // This bounded actor read permits only replay of the retained body.
            // Never turn a missing existing or minted row into a blank editor.
            setCurrentAccess(true);
            setConfirmedUnavailable(!!receipt.current);
            setNotice(
              receipt.current
                ? "The original save is confirmed, but this search is now unavailable. Open your current named searches."
                : "This search is unavailable. Confirm any original save before opening your current named searches."
            );
          }
        } catch (error) {
          failure = error;
        }
      }
      if (failure instanceof SocialClientError && failure.status === 401) {
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
  }, [owner, searchId, clearAccount]);
  latest.current = load;
  const recheck = useCallback(() => {
    if (
      !document.hasFocus() ||
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
  const onRequest = useCallback((target: Target) => {
    original.current = target;
    receipt.current = null;
    setAcceptedReceipt(null);
    // A read started before dispatch cannot accept a later receipt.
    generation.current++;
    if (reading.current) queued.current = true;
  }, []);
  const onConfirmed = useCallback((value: Receipt) => {
    if (
      !changed.current &&
      original.current?.id === value.id &&
      original.current.expectedVersion + 1 === value.version
    ) {
      receipt.current = value;
      void latest.current();
    }
  }, []);
  const onValidationRejected = useCallback(() => {
    // A definitive validation rejection has no uncertain command to replay.
    // Keep draft fields and return a new search to the actor-level access read.
    original.current = null;
    receipt.current = null;
    setAcceptedReceipt(null);
    generation.current++;
    void latest.current();
  }, []);
  const presented = visible && parentVisible;
  return (
    <section
      className="space-y-5 [overflow-wrap:anywhere]"
      aria-label="Saved search editor"
    >
      {!presented && (
        <div className="space-y-3 rounded-xl border p-4">
          <p role="status">{notice || checking}</p>
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
                  "Reload current saved search and discard retained entries and the request? An unconfirmed save may already be received."
                )
              )
                window.location.reload();
            }}
          >
            Reload current information
          </button>
        </div>
      )}
      {unavailable &&
        !changedAccount &&
        (confirmedUnavailable ? (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={!currentAccess}
            onClick={() => {
              if (
                currentAccess &&
                confirm(
                  "The original save is confirmed. Open current named searches and discard these retained local entries?"
                )
              )
                window.location.assign(
                  "/platform/exchange/saved?view=searches"
                );
            }}
          >
            Open current named searches
          </button>
        ) : (
          <Link
            prefetch={false}
            className="gc-button gc-button-quiet"
            href="/platform/exchange/saved?view=searches"
          >
            Open current named searches
          </Link>
        ))}
      <ReadVisibility.Provider value={presented}>
        {page !== undefined && (
          <ExchangeSaveSearchForm
            owner={owner}
            query={query}
            existing={page ?? undefined}
            acceptedReceipt={acceptedReceipt}
            onRequest={onRequest}
            privacy={{
              currentAccess,
              onAccessDenied: hide,
              onConfirmed,
              onValidationRejected
            }}
          />
        )}
      </ReadVisibility.Provider>
    </section>
  );
}
