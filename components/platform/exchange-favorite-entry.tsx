"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  currentSocialOwner,
  socialRequest,
  SocialClientError
} from "@/lib/platform/social-client";
import { exchangeListingSnapshot } from "@/lib/platform/exchange-listing-snapshot";
import { PrivateSnapshotGuard } from "./private-snapshot-guard";
import type { PrivateChoiceAccess } from "./use-private-choice-action";
import { ExchangeFavoriteButton } from "./exchange-saved-controls";
import { ReadVisibility, useReadVisibility } from "./read-visibility";

type Favorite = { id: string; version: number; saved: boolean } | null;
type Snapshot = { ownerId: string; favorite: Favorite };
type Receipt = Parameters<PrivateChoiceAccess["onConfirmed"]>[0];
type Target = { id: string; expectedVersion: number };
const checking = "Checking your current favorite access…";

export function ExchangeListingGuard(props: {
  owner: string;
  url: string;
  checksum: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <PrivateSnapshotGuard
      {...props}
      project={exchangeListingSnapshot}
      recoverWithoutSnapshot
    />
  );
}

// Only account and listing identifiers cross the server boundary. This owner
// retains the original command while private saved state leaves the DOM.
export function ExchangeFavoriteEntry({
  owner,
  listingId
}: {
  owner: string;
  listingId: string;
}) {
  const parentVisible = useReadVisibility();
  const receipt = useRef<Receipt | null>(null),
    original = useRef<Target | null>(null);
  const [acceptedReceipt, setAcceptedReceipt] = useState<Receipt | null>(null);
  const [favorite, setFavorite] = useState<Favorite | undefined>(undefined);
  const [favoriteId, setFavoriteId] = useState<string | null>(null);
  const stableId = useRef<string | null>(null);
  const [visible, setVisible] = useState(false),
    [currentAccess, setCurrentAccess] = useState(false);
  const [notice, setNotice] = useState(checking),
    [changedAccount, setChangedAccount] = useState(false);
  const snapshot = useRef<Favorite | undefined>(undefined);
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
    snapshot.current = undefined;
    receipt.current = null;
    original.current = null;
    setAcceptedReceipt(null);
    identityGeneration.current++;
    hide();
    setFavorite(undefined);
    setChangedAccount(true);
    setNotice(
      "Your sign-in changed. Private choices were cleared. Reload for your current account."
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
      if (!stableId.current) {
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(
            JSON.stringify(["exchange-favorite-v1", owner, listingId])
          )
        );
        stableId.current = Array.from(new Uint8Array(digest), (b) =>
          b.toString(16).padStart(2, "0")
        ).join("");
      }
      const id = stableId.current;
      const { data } = await socialRequest<Snapshot>(
        `/api/platform/exchange?${new URLSearchParams({ view: "favorite", listingId })}`,
        undefined,
        owner,
        "POST",
        undefined,
        request.signal
      );
      const row = data.favorite;
      if (
        data.ownerId !== owner ||
        (row !== null &&
          (!row ||
            row.id !== id ||
            !Number.isInteger(row.version) ||
            row.version < 1 ||
            typeof row.saved !== "boolean"))
      )
        throw Error("Current favorite could not be confirmed. Try again.");
      if (seq !== generation.current || !active.current) return;
      setCurrentAccess(true);
      const prior = snapshot.current,
        accepted = receipt.current;
      if (accepted) {
        if (!row || row.id !== accepted.id || row.version < accepted.version) {
          setNotice(
            "The original save is confirmed. Recheck to read its current saved version."
          );
          return;
        }
        snapshot.current = row;
        setFavorite(row);
        setAcceptedReceipt(accepted);
        receipt.current = null;
        original.current = null;
      } else if (
        prior !== undefined &&
        JSON.stringify(row) !== JSON.stringify(prior)
      ) {
        setNotice(
          "Your favorite changed. The original choice is retained and concealed. Confirm any original save, then reload to review current information."
        );
        return;
      } else if (prior === undefined) {
        snapshot.current = row;
        setFavorite(row);
        setFavoriteId(id);
      }
      setVisible(true);
      setNotice("");
    } catch (error) {
      if (seq === generation.current && active.current)
        setNotice(
          request.signal.aborted
            ? "Your favorite check timed out. Try again. The original choice and request are retained."
            : error instanceof Error
              ? error.message
              : "Current favorite could not be confirmed."
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
  const onRequest = useCallback((target: Target) => {
    original.current = target;
    receipt.current = null;
    setAcceptedReceipt(null);
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
  const presented = visible && parentVisible;
  return (
    <section
      className="space-y-3 [overflow-wrap:anywhere]"
      aria-label="Private listing favorite"
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
                  "Reload current favorite and discard the retained request? An unconfirmed save may already be received."
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
        {favorite !== undefined && favoriteId && (
          <ExchangeFavoriteButton
            owner={owner}
            listingId={listingId}
            favorite={favorite}
            favoriteId={favoriteId}
            acceptedReceipt={acceptedReceipt}
            onRequest={onRequest}
            privacy={{ currentAccess, onAccessDenied: hide, onConfirmed }}
          />
        )}
      </ReadVisibility.Provider>
    </section>
  );
}
