"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExchangeHandoffView } from "@/lib/platform/exchange-handoffs";
import {
  currentSocialOwner,
  socialRequest,
  SocialClientError
} from "@/lib/platform/social-client";
import { ExchangeInquiryForm } from "./exchange-handoff-controls";
import { ReadVisibility, useReadVisibility } from "./read-visibility";

type Snapshot = Pick<ExchangeHandoffView, "ownerId" | "target">;
const checking = "Checking your current inquiry access…";

// Retain one command owner through concealment and uncertain saves. The server
// sends only account and listing identity; private choices arrive in a current read.
export function ExchangeInquiryComposer({
  owner,
  listingId
}: {
  owner: string;
  listingId: string;
}) {
  const parentVisible = useReadVisibility(),
    router = useRouter();
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const navigated = useRef(false);
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
    setReceiptId(null);
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
        `/api/platform/exchange?${new URLSearchParams({ view: "handoff-target", listingId })}`,
        undefined,
        owner,
        "POST",
        undefined,
        request.signal
      );
      const target = data.target;
      if (
        data.ownerId !== owner ||
        (target !== null &&
          (!target ||
            target.listingId !== listingId ||
            !Number.isInteger(target.listingVersion) ||
            target.listingVersion < 0 ||
            !Number.isInteger(target.contactVersion) ||
            target.contactVersion < 0 ||
            typeof target.available !== "boolean" ||
            !(
              target.activeId === null ||
              (typeof target.activeId === "string" &&
                target.activeId.length > 0)
            ) ||
            !target.receiver ||
            typeof target.receiver.id !== "string" ||
            typeof target.receiver.name !== "string"))
      )
        throw Error(
          "Current inquiry access could not be confirmed. Try again."
        );
      if (seq !== generation.current || !active.current) return;
      // A changed target can still authorize replay of the exact original
      // command. Never adopt its versions or active ID into a mounted form.
      setCurrentAccess(!!target);
      const prior = snapshot.current;
      if (
        prior?.target &&
        JSON.stringify(target) !== JSON.stringify(prior.target)
      ) {
        setNotice(
          "This listing’s inquiry choices changed. Your local entries are retained and concealed. Confirm any original save, then reload to review current choices."
        );
      } else {
        snapshot.current = data;
        setPage(data);
        setVisible(true);
        setNotice("");
      }
    } catch (error) {
      if (seq === generation.current && active.current) {
        setNotice(
          request.signal.aborted
            ? "Your inquiry access check timed out. Try again. Your entries are retained."
            : error instanceof Error
              ? error.message
              : "Current inquiry access could not be confirmed."
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
  }, [owner, listingId, clearAccount]);
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
  const onConfirmed = useCallback((receipt: { id: string }) => {
    if (!changed.current) setReceiptId(receipt.id);
  }, []);
  useEffect(() => {
    if (
      !receiptId ||
      navigated.current ||
      !currentAccess ||
      !parentVisible ||
      !active.current ||
      changed.current ||
      document.visibilityState === "hidden" ||
      navigator.onLine === false
    )
      return;
    navigated.current = true;
    router.push(`/platform/exchange/handoffs/${receiptId}`);
  }, [receiptId, currentAccess, parentVisible, router]);
  const presented = visible && parentVisible;
  return (
    <section className="space-y-5" aria-label="Listing inquiry">
      <h2 className="text-2xl">Ask about this listing</h2>
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
                  "Reload current inquiry choices and discard local entries? An unconfirmed save may already be received."
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
        {page?.target ? (
          <ExchangeInquiryForm
            owner={owner}
            target={page.target}
            privacy={{ currentAccess, onAccessDenied: hide, onConfirmed }}
          />
        ) : presented ? (
          <p>
            A private inquiry is not currently available to this account. The
            receiving adult’s listing and contact choices determine access.
          </p>
        ) : null}
      </ReadVisibility.Provider>
    </section>
  );
}
