"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  currentSocialOwner,
  socialRequest,
  SocialClientError
} from "@/lib/platform/social-client";
import type { PrivateChoiceAccess } from "./use-private-choice-action";
import { useNeedProgressRefresh } from "./exchange-need-progress";
import { NeedVolunteerReceipt } from "./exchange-need-actions";
import { ReadVisibility, useReadVisibility } from "./read-visibility";

type Signup = {
  id: string;
  version: number;
  name: string;
  state: "ACTIVE" | "CANCELED";
  completedAt: string | null;
};
type Snapshot = {
  ownerId: string;
  volunteerNeedId: string;
  volunteerSlotId: string;
  volunteerRole: string;
  volunteers: Signup[];
  next: string | null;
};
type Props = {
  owner: string;
  needId: string;
  slotId: string;
  path: string;
  after?: string;
};
type Receipt = Parameters<PrivateChoiceAccess["onConfirmed"]>[0];
type Target = { id: string; expectedVersion: number; completed: boolean };
const checking = "Checking your current volunteer access…";
function validPage(
  data: Snapshot,
  owner: string,
  needId: string,
  slotId: string
) {
  return (
    data?.ownerId === owner &&
    data.volunteerNeedId === needId &&
    data.volunteerSlotId === slotId &&
    typeof data.volunteerRole === "string" &&
    (data.next === null || (typeof data.next === "string" && !!data.next)) &&
    Array.isArray(data.volunteers) &&
    data.volunteers.length <= 20 &&
    new Set(data.volunteers.map((row) => row?.id)).size ===
      data.volunteers.length &&
    data.volunteers.every(
      (row) =>
        row &&
        typeof row.id === "string" &&
        !!row.id &&
        Number.isSafeInteger(row.version) &&
        row.version >= 1 &&
        typeof row.name === "string" &&
        ["ACTIVE", "CANCELED"].includes(row.state) &&
        (row.completedAt === null ||
          (typeof row.completedAt === "string" &&
            Number.isFinite(Date.parse(row.completedAt))))
    )
  );
}

export function ExchangeNeedVolunteers(props: Props) {
  return (
    <VolunteerPage
      key={JSON.stringify([
        props.owner,
        props.needId,
        props.slotId,
        props.after
      ])}
      {...props}
    />
  );
}

// One bounded canonical read owns the page; each retained card owns its original
// command and unsent fields. Concealment never unmounts those command owners.
function VolunteerPage({ owner, needId, slotId, path, after }: Props) {
  const refreshNeedProgress = useNeedProgressRefresh(owner, needId);
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
      !document.hasFocus() ||
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
        view: "need-volunteers",
        id: slotId
      });
      if (after) params.set("after", after);
      const { data } = await socialRequest<Snapshot>(
        `/api/platform/exchange?${params}`,
        undefined,
        owner,
        "POST",
        undefined,
        request.signal
      );
      if (!validPage(data, owner, needId, slotId))
        throw Error("Current volunteers could not be confirmed. Try again.");
      if (seq !== generation.current || !active.current) return;
      setCurrentAccess(true);
      const prior = snapshot.current;
      if (prior) {
        const samePage =
          prior.next === data.next &&
          prior.volunteerRole === data.volunteerRole &&
          prior.volunteers.length === data.volunteers.length &&
          prior.volunteers.every(
            (row, index) => row.id === data.volunteers[index].id
          );
        const authorized =
          samePage &&
          data.volunteers.every((row, index) => {
            const receipt = receipts.current.get(row.id);
            const original = originals.current.get(row.id);
            if (receipt && original)
              return (
                receipt.id === row.id &&
                receipt.version === row.version &&
                Boolean(row.completedAt) === original.completed &&
                row.name === prior.volunteers[index].name &&
                row.state === prior.volunteers[index].state
              );
            return (
              JSON.stringify(row) === JSON.stringify(prior.volunteers[index])
            );
          });
        if (!authorized) {
          setNotice(
            "Your volunteers changed. The original entries are retained and concealed. Confirm any original request, then reload to review current information."
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
      if (confirmedCommand) {
        void refreshNeedProgress?.().catch(() => {});
        router.refresh();
      }
    } catch (error) {
      if (seq === generation.current && active.current)
        setNotice(
          request.signal.aborted
            ? "Your volunteer check timed out. Try again. The original entries and requests are retained."
            : error instanceof Error
              ? error.message
              : "Current volunteers could not be confirmed."
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
  }, [owner, needId, slotId, after, clearAccount, router, refreshNeedProgress]);
  latest.current = load;
  const recheck = useCallback(() => {
    if (
      document.visibilityState === "hidden" ||
      !document.hasFocus() ||
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
      aria-label="Volunteer completion"
    >
      <h2 className="text-2xl">Volunteer completion</h2>
      {presented && page && (
        <h3 className="text-xl">{page.volunteerRole}: completion records</h3>
      )}
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
                  "Reload current volunteers and discard retained entries and requests? An unconfirmed request may already be received."
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
        {page?.volunteers.map((row) => (
          <NeedVolunteerReceipt
            key={row.id}
            signup={row}
            needId={needId}
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
      {presented && page && !page.volunteers.length && (
        <p>No signups on this page.</p>
      )}
      {presented && page?.next && (
        <Link
          prefetch={false}
          className="gc-button gc-button-quiet"
          href={`${path}?volunteers=${encodeURIComponent(slotId)}&after=${encodeURIComponent(page.next)}`}
        >
          More volunteer signups
        </Link>
      )}
    </section>
  );
}
