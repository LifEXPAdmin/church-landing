import { API_VERSION, RequestClientError, apiContracts, apiId, decodeApiResponse, type ApiResponse, type WireValue } from "@godschurches/shared-core";
import type { NativeClient } from "../session/native-client.ts";
import type { createNativeSessionController } from "../session/session-controller.ts";
import type { createNativeReadController, ReadingSnapshot } from "./read-controller.ts";

type Session = Pick<ReturnType<typeof createNativeSessionController>, "getSnapshot" | "subscribe" | "reportReadRejection">;
type Reading = Pick<ReturnType<typeof createNativeReadController>, "getSnapshot" | "subscribe">;
type Detail = Extract<ReadingSnapshot, { kind: "post" }>["post"];
type Query = WireValue<typeof apiContracts.comments.query>;
type Thread = ApiResponse<"comments">["data"];
type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
type Problem = "unavailable" | "feature-unavailable" | "not-found" | "refresh-required" | "recovery-required" | "update-required" | "rate-limited";
export type CommentSnapshot =
  | Readonly<{ phase: "concealed"; postId: null }>
  | Readonly<{ phase: "idle"; postId: string | null }>
  | Readonly<{ phase: "loading"; postId: string; query: Readonly<Query> }>
  | Readonly<{ phase: "error"; postId: string; query: Readonly<Query>; problem: Problem; retryAfterSeconds: number | null }>
  | Readonly<{ phase: "ready"; postId: string; query: Readonly<Query>; thread: Immutable<Thread> }>;

/** The existing canonical client supplies this port when route integration is
 * ready. This controller neither creates a transport nor keeps credentials. */
export type NativeCommentReadPort = Pick<NativeClient, "capabilities"> & {
  comments(owner: string, postId: string, query: Readonly<Query>, signal: AbortSignal): Promise<ApiResponse<"comments">>;
};
type View = { owner: string; generation: number; post: Detail; postId: string };
const concealed: CommentSnapshot = Object.freeze({ phase: "concealed", postId: null });
function immutable<T>(value: T): Immutable<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value as Immutable<T>;
}
function roots(sort: Query["sort"]): Query { return { view: "roots", sort, rootId: null, commentId: null, cursor: null }; }
function bound(thread: Thread, postId: string, query: Readonly<Query>) {
  if (thread.postId !== postId || thread.sort !== query.sort ||
    new Set(thread.items.map(item => item.id)).size !== thread.items.length) return false;
  if (query.view === "roots") return thread.root === null && thread.target === null &&
    thread.items.every(item => item.rootId === null);
  const root = thread.root;
  if (!root || root.rootId !== null || !thread.items.every(item => item.rootId === root.id)) return false;
  if (query.view === "replies") return root.id === query.rootId && thread.target === null;
  return thread.target?.id === query.commentId && (thread.target.rootId ?? thread.target.id) === root.id;
}
function problem(error: unknown): Problem {
  if (!(error instanceof RequestClientError) || !error.responseError) return "unavailable";
  return error.code === "not_found" || error.code === "forbidden" ? "not-found" :
    error.code === "cursor_invalid" || error.code === "conflict" ? "refresh-required" :
    error.code === "recovery_required" ? "recovery-required" :
    error.code === "unsupported_version" ? "update-required" :
    error.code === "feature_unavailable" ? "feature-unavailable" :
    error.code === "rate_limited" ? "rate-limited" : "unavailable";
}

/** One explicit read selection and one bounded response. The parent reader owns
 * freshness. Losing its exact detail clears this selection, including during a
 * passive recheck; a loading snapshot alone cannot prove route continuity. */
export function createNativeCommentController(session: Session, reading: Reading, client: NativeCommentReadPort) {
  let disposed = false, syncing = false, notifyPending = false, serial = 0;
  let view: View | null = null, active: AbortController | null = null;
  let state: CommentSnapshot = concealed;
  const listeners = new Set<() => void>();
  function notify() {
    for (const listener of listeners) { try { listener(); } catch { /* Concealment must finish. */ } }
  }
  function publish(next: CommentSnapshot) {
    if (state === next) return;
    state = Object.freeze(next);
    // Disposal must deliver final concealment before removing subscribers,
    // even when an authority getter triggered it during synchronization.
    if (syncing && !disposed) notifyPending = true;
    else notify();
  }
  function cancel() { serial++; active?.abort(); active = null; }
  function sync() {
    if (disposed || syncing) return;
    syncing = true;
    try {
      const detail = reading.getSnapshot();
      // Reading can synchronously expire access. Sample the session afterwards.
      const account = session.getSnapshot();
      if (disposed) return;
      if (!account.foreground || account.phase !== "ready" || !account.account) {
        if (view || active) cancel();
        view = null; publish(concealed); return;
      }
      const primary = detail.kind === "post" ? detail.post.repost?.kind === "PLAIN" ? detail.post.repost.source : detail.post : null;
      const verifiedDetail = reading.getSnapshot(), verifiedAccount = session.getSnapshot();
      if (disposed) return;
      if (detail.kind !== "post" || !primary || verifiedDetail !== detail || verifiedAccount !== account) {
        if (view || active) cancel();
        view = null;
        if (!verifiedAccount.foreground || verifiedAccount.phase !== "ready" || !verifiedAccount.account) { publish(concealed); return; }
        if (state.phase !== "idle" || state.postId !== null) publish({ phase: "idle", postId: null });
        return;
      }
      if (view?.post === detail.post && view.owner === account.account.id && view.generation === account.generation) return;
      cancel();
      view = { owner: account.account.id, generation: account.generation, post: detail.post, postId: primary.id };
      publish({ phase: "idle", postId: primary.id });
    } finally {
      syncing = false;
      // Subscribers must observe the settled authority, not an intermediate
      // state produced while a parent getter is still notifying its listeners.
      if (notifyPending) { notifyPending = false; notify(); }
    }
  }
  const unsubscribeSession = session.subscribe(sync), unsubscribeReading = reading.subscribe(sync);
  sync();
  function admitted(expected: CommentSnapshot) {
    if (syncing) return false;
    sync();
    return !disposed && expected === state && !!view;
  }
  function current(request: number, target: View, controller: AbortController) {
    if (syncing) return false;
    sync();
    return !disposed && request === serial && view === target && !controller.signal.aborted;
  }
  async function load(target: View, input: Query) {
    if (disposed || view !== target) return;
    const query = Object.freeze(apiContracts.comments.query.parse(input));
    cancel();
    const request = serial, controller = new AbortController(); active = controller;
    publish({ phase: "loading", postId: target.postId, query });
    try {
      if (!current(request, target, controller)) return;
      const capability = await client.capabilities(target.owner, controller.signal);
      if (!current(request, target, controller)) return;
      if (capability.viewerId !== target.owner || capability.apiVersion !== API_VERSION) throw Error("Comment capability binding changed.");
      if (!capability.data.supportedVersions.includes(API_VERSION)) {
        publish({ phase: "error", postId: target.postId, query, problem: "update-required", retryAfterSeconds: null }); return;
      }
      const features = capability.data.features.filter(item => item.name === "comments.read");
      if (features.length !== 1 || !features[0].available) {
        publish({ phase: "error", postId: target.postId, query, problem: "feature-unavailable", retryAfterSeconds: null }); return;
      }
      const response = await client.comments(target.owner, target.postId, query, controller.signal);
      if (!current(request, target, controller)) return;
      // Reuse the canonical decoder at this injected boundary, including its
      // 20-row limit and unavailable projections. Do not copy DTO policy here.
      const thread = decodeApiResponse("comments", response, target.owner).data;
      if (!bound(thread, target.postId, query)) throw Error("Comment selection did not match the request.");
      publish({ phase: "ready", postId: target.postId, query, thread: immutable(thread) });
    } catch (error) {
      if (!current(request, target, controller)) return;
      if (error instanceof RequestClientError && error.responseError && error.status === 401 &&
        (error.code === "unauthenticated" || error.code === "account_changed")) {
        await session.reportReadRejection(error, target.owner, target.generation); return;
      }
      publish({ phase: "error", postId: target.postId, query, problem: problem(error),
        retryAfterSeconds: error instanceof RequestClientError && error.responseError ? error.retryAfter ?? null : null });
    } finally { controller.abort(); if (request === serial) active = null; }
  }
  return {
    getSnapshot(): CommentSnapshot {
      // An earlier parent subscriber can read us during synchronous expiry.
      // Until that getter settles, neither old content nor actions are current.
      if (syncing) return concealed;
      sync(); return state;
    },
    subscribe(listener: () => void) {
      if (!disposed) listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    openRoots(expected: CommentSnapshot, sort: Query["sort"] = "oldest") {
      return admitted(expected) && state.phase !== "loading" ? load(view!, roots(sort)) : Promise.resolve();
    },
    openReplies(expected: CommentSnapshot, rootId: string) {
      if (!admitted(expected) || state.phase !== "ready") return Promise.resolve();
      const thread = state.thread;
      const root = [thread.root, thread.target, thread.pinned, ...thread.items].find(item => item?.id === rootId && item.rootId === null);
      return root && root.replyCount > 0 ? load(view!, { view: "replies", sort: "oldest", rootId: root.id, commentId: null, cursor: null }) : Promise.resolve();
    },
    /** A canonical comment address from an explicit selection or future link.
     * The server resolves access; an old rendered snapshot cannot retarget it. */
    openContext(expected: CommentSnapshot, commentId: string) {
      return admitted(expected) && state.phase !== "loading" ? load(view!, {
        view: "context", sort: "oldest", rootId: null, commentId: apiId.parse(commentId), cursor: null
      }) : Promise.resolve();
    },
    nextPage(expected: CommentSnapshot) {
      return admitted(expected) && state.phase === "ready" && state.thread.nextCursor
        ? load(view!, { ...state.query, cursor: state.thread.nextCursor }) : Promise.resolve();
    },
    refresh(expected: CommentSnapshot) {
      return admitted(expected) && (state.phase === "ready" || state.phase === "error")
        ? load(view!, { ...state.query, cursor: null }) : Promise.resolve();
    },
    retry(expected: CommentSnapshot) {
      return admitted(expected) && state.phase === "error" && ["unavailable", "rate-limited"].includes(state.problem)
        ? load(view!, state.query) : Promise.resolve();
    },
    close(expected: CommentSnapshot) {
      if (admitted(expected)) { cancel(); publish({ phase: "idle", postId: view!.postId }); }
    },
    dispose() {
      if (disposed) return;
      disposed = true; unsubscribeSession(); unsubscribeReading(); cancel(); view = null;
      publish(concealed); listeners.clear();
    }
  };
}
