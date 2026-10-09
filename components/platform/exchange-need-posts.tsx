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
import { NeedPostLinks } from "./exchange-need-actions";
import { ReadVisibility, useReadVisibility } from "./read-visibility";

type Snapshot = {
  ownerId: string;
  postsListingId: string;
  postsNeedId: string;
  postsNeedVersion: number;
  postsCanLink: boolean;
  posts: { id: string; version: number; excerpt: string; linked: boolean }[];
  next: string | null;
};
type Receipt = Parameters<PrivateChoiceAccess["onConfirmed"]>[0];
type Target = {
  id: string;
  expectedVersion: number;
  postId: string;
  postVersion: number;
  linked: boolean;
};
type Props = {
  owner: string;
  listingId: string;
  needId: string;
  path: string;
  after?: string;
};
function foreground() {
  return (
    document.visibilityState !== "hidden" &&
    document.hasFocus() &&
    navigator.onLine !== false
  );
}
const checking = "Checking your current church Need post access…";
function validPage(
  data: Snapshot,
  owner: string,
  listingId: string,
  needId: string
) {
  return (
    data?.ownerId === owner &&
    data.postsListingId === listingId &&
    data.postsNeedId === needId &&
    Number.isSafeInteger(data.postsNeedVersion) &&
    data.postsNeedVersion >= 1 &&
    data.postsCanLink === true &&
    (data.next === null || (typeof data.next === "string" && !!data.next)) &&
    Array.isArray(data.posts) &&
    data.posts.length <= 20 &&
    new Set(data.posts.map((p) => p?.id)).size === data.posts.length &&
    data.posts.every(
      (p) =>
        p &&
        typeof p.id === "string" &&
        !!p.id &&
        Number.isSafeInteger(p.version) &&
        p.version >= 1 &&
        typeof p.excerpt === "string" &&
        p.excerpt.length <= 180 &&
        typeof p.linked === "boolean"
    )
  );
}
export function ExchangeNeedPosts(props: Props) {
  return (
    <PostPage
      key={JSON.stringify([
        props.owner,
        props.listingId,
        props.needId,
        props.after
      ])}
      {...props}
    />
  );
}
// One original command owns the need version. Concealment retains its owner.
function PostPage({ owner, listingId, needId, path, after }: Props) {
  const router = useRouter(),
    parentVisible = useReadVisibility();
  const receipt = useRef<Receipt | null>(null),
    original = useRef<Target | null>(null);
  const [acceptedReceipt, setAcceptedReceipt] = useState<Receipt | null>(null);
  const snapshot = useRef<Snapshot | null>(null),
    [page, setPage] = useState<Snapshot | null>(null);
  const [visible, setVisible] = useState(false),
    [currentAccess, setCurrentAccess] = useState(false);
  const [notice, setNotice] = useState(checking),
    [changedAccount, setChangedAccount] = useState(false);
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
    original.current = null;
    setAcceptedReceipt(null);
    identityGeneration.current++;
    hide();
    setPage(null);
    setChangedAccount(true);
    setNotice(
      "Your sign-in changed. Private choices were cleared. Reload for your current account."
    );
  }, [hide]);
  const load = useCallback(async () => {
    if (
      !active.current ||
      changed.current ||
      !foreground()
    ) {
      if (active.current && !changed.current) hide();
      return;
    }
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
      const { data } = await socialRequest<Snapshot>(
        `/api/platform/exchange?${new URLSearchParams({ view: "need-posts", listingId, ...(after ? { after } : {}) })}`,
        undefined,
        owner,
        "POST",
        undefined,
        request.signal
      );
      if (!validPage(data, owner, listingId, needId))
        throw Error(
          "Current church Need posts could not be confirmed. Try again."
        );
      if (
        seq !== generation.current ||
        !active.current ||
        !foreground()
      )
        return;
      setCurrentAccess(true);
      const prior = snapshot.current,
        accepted = receipt.current,
        target = original.current;
      if (prior) {
        const samePage =
          prior.next === data.next &&
          prior.posts.length === data.posts.length &&
          prior.posts.every((p, i) => p.id === data.posts[i].id);
        const authorized =
          accepted &&
          target &&
          target.id === needId &&
          accepted.id === needId &&
          target.expectedVersion === prior.postsNeedVersion &&
          accepted.version === target.expectedVersion + 1 &&
          data.postsNeedVersion === accepted.version &&
          samePage &&
          prior.posts.some(
            (p) => p.id === target.postId && p.version === target.postVersion
          ) &&
          data.posts.every((p, i) =>
            p.id === target.postId
              ? p.version === target.postVersion + 1 &&
                p.linked === target.linked &&
                p.excerpt === prior.posts[i].excerpt
              : JSON.stringify(p) === JSON.stringify(prior.posts[i])
          );
        if (
          accepted
            ? !authorized
            : JSON.stringify(prior) !== JSON.stringify(data)
        ) {
          setNotice(
            "Your church Need posts changed. Original entries and requests are retained and concealed. Confirm any original request, then reload to inspect current information."
          );
          return;
        }
      }
      snapshot.current = data;
      setPage(data);
      if (accepted) {
        setAcceptedReceipt(accepted);
        receipt.current = null;
        original.current = null;
        router.refresh();
      }
      setVisible(true);
      setNotice("");
    } catch (error) {
      if (seq === generation.current && active.current)
        setNotice(
          request.signal.aborted
            ? "Your post check timed out. Try again. The original entries and request are retained."
            : error instanceof Error
              ? error.message
              : "Current church Need posts could not be confirmed."
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
  }, [owner, listingId, needId, after, clearAccount, router, hide]);
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
  const rejected = useCallback(() => {
    original.current = null;
    receipt.current = null;
    setAcceptedReceipt(null);
    generation.current++;
    void latest.current();
  }, []);
  const presented = visible && parentVisible;
  return (
    <section
      className="space-y-3 [overflow-wrap:anywhere]"
      aria-label="Current church Need posts"
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
                  "Reload current posts and discard the retained request? An unconfirmed request may already be saved."
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
        {page && (
          <NeedPostLinks
            owner={owner}
            need={{ id: needId, version: page.postsNeedVersion }}
            posts={page.posts}
            acceptedReceipt={acceptedReceipt}
            onRequest={onRequest}
            privacy={{
              currentAccess,
              onAccessDenied: hide,
              onConfirmed,
              onValidationRejected: rejected
            }}
          />
        )}
      </ReadVisibility.Provider>
      {presented && page?.next && (
        <Link
          prefetch={false}
          className="gc-button gc-button-quiet"
          href={`${path}?postsAfter=${encodeURIComponent(page.next)}`}
        >
          More eligible church Need posts
        </Link>
      )}
    </section>
  );
}
