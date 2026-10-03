"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NeedContributionView } from "@/lib/platform/exchange-need-reads";
import {
  currentSocialOwner,
  socialRequest,
  SocialClientError
} from "@/lib/platform/social-client";
import type { PrivateChoiceAccess } from "./use-private-choice-action";
import { useNeedProgressRefresh } from "./exchange-need-progress";
import { NeedContributionCard } from "./exchange-need-actions";
import { ReadVisibility, useReadVisibility } from "./read-visibility";

type Snapshot = {
  ownerId: string;
  contributions: NeedContributionView[];
  next: string | null;
};
type ContributionsQuery =
  | { view: "mine"; after?: string }
  | { view: "incoming"; needId: string; path: string; after?: string };
type Receipt = Parameters<PrivateChoiceAccess["onConfirmed"]>[0];
type Target = { id: string; expectedVersion: number };
const checking = "Checking your current contribution access…";
function inScope(row: NeedContributionView, query: ContributionsQuery) {
  if (query.view === "mine") return row.own === true;
  if (!row.own) return row.current === true && row.needId === query.needId;
  return (
    row.current === false &&
    row.needId === null &&
    row.slotId === null &&
    row.listingId === null &&
    row.title === "Unavailable need" &&
    row.note === "" &&
    row.quoteMinor === null &&
    row.quoteCurrency === null &&
    row.shareName === false &&
    row.disputeNote === "" &&
    row.loanResponsibility === "" &&
    row.contributor === null
  );
}
function validPage(data: Snapshot, owner: string, query: ContributionsQuery) {
  return (
    data?.ownerId === owner &&
    Array.isArray(data.contributions) &&
    data.contributions.length <= 20 &&
    (data.next === null || typeof data.next === "string") &&
    new Set(data.contributions.map((row) => row?.id)).size ===
      data.contributions.length &&
    data.contributions.every(
      (row) =>
        row &&
        typeof row.id === "string" &&
        !!row.id &&
        inScope(row, query) &&
        Number.isInteger(row.version) &&
        row.version >= 1 &&
        [
          "COMMITTED",
          "QUOTED",
          "WAITLISTED",
          "DECLINED",
          "CANCELED",
          "REVOKED"
        ].includes(row.state) &&
        [row.quantity, row.received, row.returned].every(
          (n) => Number.isInteger(n) && n >= 0 && n <= 10000
        ) &&
        row.returned <= row.received &&
        row.received <= row.quantity &&
        [
          row.title,
          row.note,
          row.disputeNote,
          row.loanResponsibility,
          row.createdAt
        ].every((s) => typeof s === "string") &&
        [row.current, row.shareName, row.disputed].every(
          (b) => typeof b === "boolean"
        ) &&
        [
          row.listingId,
          row.needId,
          row.slotId,
          row.loanReturnAt,
          row.endedAt,
          row.quoteCurrency
        ].every((s) => s === null || typeof s === "string") &&
        (row.quoteMinor === null ||
          (Number.isSafeInteger(row.quoteMinor) && row.quoteMinor >= 0)) &&
        (row.contributor === null ||
          (row.own === false &&
            row.shareName === true &&
            typeof row.contributor === "object" &&
            typeof row.contributor.name === "string"))
    )
  );
}

// One bounded canonical read owns the page; each retained card owns its original
// command and unsent fields. Concealment never unmounts those command owners.
export function ExchangeNeedContributions({
  owner,
  query
}: {
  owner: string;
  query: ContributionsQuery;
}) {
  const incoming = query.view === "incoming";
  const refreshNeedProgress = useNeedProgressRefresh(
    owner,
    incoming ? query.needId : null
  );
  const router = useRouter();
  const parentVisible = useReadVisibility();
  const snapshot = useRef<Snapshot | null>(null);
  const originals = useRef(new Map<string, Target>());
  const receipts = useRef(new Map<string, Receipt>());
  const [accepted, setAccepted] = useState(new Map<string, Receipt>());
  const [page, setPage] = useState<Snapshot | null>(null);
  const [visible, setVisible] = useState(false);
  const [currentAccess, setCurrentAccess] = useState(false);
  const [changedAccount, setChangedAccount] = useState(false);
  const [notice, setNotice] = useState(checking);
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
    originals.current.clear();
    receipts.current.clear();
    setAccepted(new Map());
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
    const seq = ++generation.current,
      identity = ++identityGeneration.current;
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
      const params = new URLSearchParams({
        view: incoming ? "need-contributors" : "need-mine",
        ...(incoming ? { id: query.needId } : {})
      });
      if (query.after) params.set("after", query.after);
      const { data } = await socialRequest<Snapshot>(
        `/api/platform/exchange?${params}`,
        undefined,
        owner,
        "POST",
        undefined,
        request.signal
      );
      if (!validPage(data, owner, query))
        throw Error("Current contributions could not be confirmed. Try again.");
      if (seq !== generation.current || !active.current) return;
      setCurrentAccess(true);
      const prior = snapshot.current;
      if (prior) {
        const samePage =
          prior.next === data.next &&
          prior.contributions.length === data.contributions.length &&
          prior.contributions.every(
            (row, index) => row.id === data.contributions[index].id
          );
        const authorized =
          samePage &&
          data.contributions.every((row, index) => {
            const receipt = receipts.current.get(row.id);
            if (receipt)
              return receipt.id === row.id && receipt.version === row.version;
            return (
              JSON.stringify(row) === JSON.stringify(prior.contributions[index])
            );
          });
        if (!authorized) {
          setNotice(
            "Your contributions changed. The original entries are retained and concealed. Confirm any original request, then reload to review current information."
          );
          return;
        }
      }
      snapshot.current = data;
      setPage(data);
      const confirmedCommand = receipts.current.size > 0;
      if (confirmedCommand) {
        const confirmed = new Map(receipts.current);
        setAccepted((previous) => new Map([...previous, ...confirmed]));
        for (const id of confirmed.keys()) originals.current.delete(id);
        receipts.current.clear();
      }
      setVisible(true);
      setNotice("");
      if (incoming && confirmedCommand) {
        void refreshNeedProgress?.().catch(() => {});
        router.refresh();
      }
    } catch (error) {
      if (seq === generation.current && active.current)
        setNotice(
          request.signal.aborted
            ? "Your contribution check timed out. Try again. The original entries and requests are retained."
            : error instanceof Error
              ? error.message
              : "Current contributions could not be confirmed."
        );
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
  }, [owner, query, incoming, clearAccount, router, refreshNeedProgress]);
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
  const onRequest = useCallback((target: Target) => {
    originals.current.set(target.id, target);
    receipts.current.delete(target.id);
    setAccepted((previous) => {
      const next = new Map(previous);
      next.delete(target.id);
      return next;
    });
    generation.current++;
    if (reading.current) queued.current = true;
  }, []);
  const onConfirmed = useCallback((value: Receipt) => {
    const original = originals.current.get(value.id);
    if (
      !changed.current &&
      original &&
      original.expectedVersion + 1 === value.version
    ) {
      receipts.current.set(value.id, value);
      void latest.current();
    }
  }, []);
  const rejected = useCallback((id: string) => {
    originals.current.delete(id);
    receipts.current.delete(id);
    setAccepted((previous) => {
      const next = new Map(previous);
      next.delete(id);
      return next;
    });
    generation.current++;
    void latest.current();
  }, []);
  const presented = visible && parentVisible;
  return (
    <section
      className="space-y-5 [overflow-wrap:anywhere]"
      aria-label={
        incoming ? "Incoming private contributions" : "My contributions"
      }
    >
      {incoming ? (
        <h2 className="text-2xl">Incoming private contributions</h2>
      ) : (
        <h1 className="text-4xl">My Needs contributions</h1>
      )}
      <p>
        {incoming
          ? "Private contributions addressed to your current coordinator appointment. Current source details remain subject to access checks."
          : "Your promises, private quotes, receipts and outstanding equipment returns. Current source details remain subject to access checks."}
      </p>
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
                  "Reload current contributions and discard retained entries and requests? An unconfirmed request may already be received."
                )
              )
                window.location.reload();
            }}
          >
            Reload current information
          </button>
        </div>
      )}
      <ReadVisibility.Provider value={presented}>
        {page?.contributions.map((row) => (
          <NeedContributionCard
            key={row.id}
            row={row}
            owner={owner}
            acceptedReceipt={accepted.get(row.id) ?? null}
            onRequest={onRequest}
            privacy={{
              currentAccess,
              onAccessDenied: hide,
              onConfirmed,
              onValidationRejected: () => rejected(row.id)
            }}
          />
        ))}
      </ReadVisibility.Provider>
      {presented && page && !page.contributions.length && (
        <p>No contributions yet.</p>
      )}
      {presented && page?.next && (
        <Link
          prefetch={false}
          className="gc-button gc-button-quiet"
          href={
            incoming
              ? `${query.path}?view=contributors&after=${encodeURIComponent(page.next)}`
              : `/platform/exchange/needs?after=${encodeURIComponent(page.next)}`
          }
        >
          {incoming ? "More incoming contributions" : "More contributions"}
        </Link>
      )}
    </section>
  );
}
