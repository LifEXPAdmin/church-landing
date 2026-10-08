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
import { ExchangeSavedItems } from "./exchange-saved-controls";
import { ReadVisibility, useReadVisibility } from "./read-visibility";

type Snapshot = Awaited<ReturnType<typeof readExchangeSaved>>;
type Receipt = Parameters<PrivateChoiceAccess["onConfirmed"]>[0];
type View = "favorites" | "searches";
function validPage(data: Snapshot, owner: string, view: View) {
  const rows = view === "favorites" ? data.favorites : data.searches;
  return (
    data.ownerId === owner &&
    (data.after === null || typeof data.after === "string") &&
    Array.isArray(rows) &&
    rows.length <= 20 &&
    rows.every(
      (row) =>
        typeof row.id === "string" &&
        !!row.id &&
        Number.isInteger(row.version) &&
        row.version >= 0
    ) &&
    (view === "favorites"
      ? data.favorites!.every(
          (row) =>
            row.listing === null ||
            (typeof row.listing?.id === "string" &&
              typeof row.listing.title === "string")
        )
      : data.searches!.every(
          (row) =>
            typeof row.name === "string" &&
            typeof row.alerts === "boolean" &&
            typeof row.href === "string" &&
            !!row.criteria &&
            typeof row.criteria === "object" &&
            !Array.isArray(row.criteria)
        ))
  );
}
const checking = "Checking your current saved choices access…";

// Retain the existing list-wide command owner through concealment and row
// removal. Private rows initialize only through a current account-pinned read.
export function ExchangeSavedList({
  owner,
  url,
  view,
  returnHref
}: {
  owner: string;
  url: string;
  view: View;
  returnHref: string;
}) {
  const parentVisible = useReadVisibility();
  const receipt = useRef<Receipt | null>(null),
    original = useRef(false);
  const [acceptedReceipt, setAcceptedReceipt] = useState<Receipt | null>(null);
  const [invalidPage, setInvalidPage] = useState(false);
  const [page, setPage] = useState<Snapshot | null>(null);
  const [visible, setVisible] = useState(false);
  const [currentAccess, setCurrentAccess] = useState(false);
  const [notice, setNotice] = useState(checking);
  const [changedAccount, setChangedAccount] = useState(false);
  const snapshot = useRef<Snapshot | null>(null);
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
    receipt.current = null;
    original.current = false;
    setAcceptedReceipt(null);
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
        url,
        undefined,
        owner,
        "POST",
        undefined,
        request.signal
      );
      if (!validPage(data, owner, view))
        throw Error("Current saved choices could not be confirmed. Try again.");
      if (seq !== generation.current || !active.current) return;
      setCurrentAccess(true);
      setInvalidPage(false);
      const prior = snapshot.current;
      if (
        prior &&
        JSON.stringify(data) !== JSON.stringify(prior) &&
        !receipt.current
      ) {
        setNotice(
          "Your saved choices changed. The original page is retained and concealed. Confirm any original save, then reload to review current choices."
        );
      } else {
        snapshot.current = data;
        setPage(data);
        if (receipt.current) {
          // The exact receipt established success. A row may have disappeared,
          // or a favorite may have been re-added with a newer version elsewhere.
          setAcceptedReceipt(receipt.current);
          receipt.current = null;
          original.current = false;
        }
        setVisible(true);
        setNotice("");
      }
    } catch (error) {
      let failure = error;
      const cursorChanged =
        error instanceof SocialClientError &&
        error.status === 409 &&
        !!new URLSearchParams(url.split("?")[1]).get("after");
      if (seq === generation.current && active.current) {
        setInvalidPage(!!cursorChanged);
        setNotice(
          request.signal.aborted
            ? "Your saved choices check timed out. Try again. The original request is retained."
            : error instanceof Error
              ? error.message
              : "Current saved choices could not be confirmed."
        );
      }
      if (cursorChanged && original.current) {
        try {
          const { data } = await socialRequest<Snapshot>(
            `/api/platform/exchange?${new URLSearchParams({ view })}`,
            undefined,
            owner,
            "POST",
            undefined,
            request.signal
          );
          if (!validPage(data, owner, view))
            throw Error("Current saved choices could not be confirmed.");
          if (
            seq === generation.current &&
            active.current &&
            !changed.current
          ) {
            // A canonical first-page read establishes actor access for replay
            // only. Never adopt it as the old page or re-arm a new command here.
            setCurrentAccess(true);
            setNotice(
              receipt.current
                ? "The original save is confirmed. Open the first page to review current saved choices."
                : "This page's cursor changed. Confirm any original save, then open the first page."
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
  }, [owner, url, view, clearAccount]);
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
  const onRequest = useCallback(() => {
    original.current = true;
    receipt.current = null;
    setAcceptedReceipt(null);
  }, []);
  const onConfirmed = useCallback((value: Receipt) => {
    if (!changed.current) {
      receipt.current = value;
      void latest.current();
    }
  }, []);
  const presented = visible && parentVisible;
  return (
    <section
      className="space-y-5 [overflow-wrap:anywhere]"
      aria-label="Saved Exchange choices"
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
                  "Reload current saved choices and discard the retained request? An unconfirmed save may already be received."
                )
              )
                window.location.reload();
            }}
          >
            Reload current information
          </button>
        </div>
      )}
      {invalidPage && !changedAccount && (
        <Link
          prefetch={false}
          className="gc-button gc-button-quiet"
          href={`/platform/exchange/saved?${new URLSearchParams({ view })}`}
        >
          Open first page
        </Link>
      )}
      <ReadVisibility.Provider value={presented}>
        {page && (
          <ExchangeSavedItems
            owner={owner}
            result={page}
            view={view}
            returnHref={returnHref}
            acceptedReceipt={acceptedReceipt}
            onRequest={onRequest}
            privacy={{ currentAccess, onAccessDenied: hide, onConfirmed }}
          />
        )}
      </ReadVisibility.Provider>
    </section>
  );
}
