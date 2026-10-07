import { API_VERSION, RequestClientError, apiContracts, apiId, type ApiResponse, type WireValue } from "@godschurches/shared-core";
import type { NativeClient } from "../session/native-client.ts";
import type { createNativeSessionController, SessionClock } from "../session/session-controller.ts";

type Session = Pick<ReturnType<typeof createNativeSessionController>, "getSnapshot" | "subscribe" | "reportReadRejection">;
type Query = WireValue<typeof apiContracts.feed.query>;
type Target = { kind: "feed"; query: Query } | { kind: "post"; id: string };
type ReadonlyValue<T> = T extends object ? { readonly [K in keyof T]: ReadonlyValue<T[K]> } : T;
type Problem = "unavailable" | "not-found" | "refresh-required" | "recovery-required" | "update-required" | "rate-limited";
export type ReadingSnapshot =
  | Readonly<{ kind: "concealed" | "idle" }>
  | Readonly<{ kind: "loading"; target: Target["kind"] }>
  | Readonly<{ kind: "error"; target: Target["kind"]; problem: Problem; retryAfterSeconds: number | null }>
  | Readonly<{ kind: "feed"; feed: ReadonlyValue<ApiResponse<"feed">["data"]> }>
  | Readonly<{ kind: "post"; post: ReadonlyValue<ApiResponse<"post">["data"]>; revealed: boolean }>;

// Canonical decoders return bounded plain objects. Freeze in place without
// retaining a serialized copy or building another domain model.
function immutable<T>(value: T): ReadonlyValue<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value as ReadonlyValue<T>;
}
const concealed: ReadingSnapshot = Object.freeze({ kind: "concealed" });
const idle: ReadingSnapshot = Object.freeze({ kind: "idle" });
const latest = (): Query => ({ mode: "latest", scope: null, cursor: null });
export const VISIBLE_RECHECK_MS = 30000;
const defaultClock: SessionClock = {
  now: () => performance.now(),
  schedule(callback, delayMs) { const id = setTimeout(callback, delayMs); return () => clearTimeout(id); }
};

/** One visible canonical response, never an accumulating list or disk cache.
 * Composition keeps the client private. No write command or retry timer exists. */
export function createNativeReadController(session: Session, client: Pick<NativeClient, "capabilities" | "feed" | "post">, clock: SessionClock = defaultClock) {
  let disposed = false, serial = 0;
  let binding: { owner: string; generation: number } | null = null;
  let active: AbortController | null = null;
  let last: Target | null = null, feedReturn: Query | null = null;
  let state: ReadingSnapshot = concealed;
  let visibleUntil: number | null = null, lastTime = -Infinity;
  let cancelRecheck: (() => void) | null = null;
  const listeners = new Set<() => void>();
  function publish(value: ReadingSnapshot) {
    if (state === value) return;
    state = Object.freeze(value);
    for (const listener of listeners) { try { listener(); } catch { /* Concealment must finish. */ } }
  }
  function now() {
    const value = clock.now();
    if (!Number.isFinite(value) || value < lastTime) throw Error("Reading freshness is unavailable.");
    lastTime = value; return value;
  }
  function cancel() {
    serial++; active?.abort(); active = null;
    cancelRecheck?.(); cancelRecheck = null; visibleUntil = null;
  }
  function sync() {
    if (disposed) return;
    const current = session.getSnapshot();
    if (disposed) return;
    const owner = current.foreground && current.phase === "ready" ? current.account?.id : null;
    if (!owner || binding?.owner !== owner || binding.generation !== current.generation) {
      cancel(); last = null; feedReturn = null;
      binding = owner ? { owner, generation: current.generation } : null;
      publish(binding ? idle : concealed);
    } else if (visibleUntil !== null) {
      let fresh = false;
      try { fresh = now() < visibleUntil; } catch { /* An untrusted clock cannot extend visibility. */ }
      if (!fresh) { visibleUntil = null; publish(idle); }
    }
  }
  const unsubscribe = session.subscribe(sync);
  sync();
  function syncUnchanged() {
    const before = serial;
    sync();
    return !disposed && serial === before;
  }
  function current(request: number, captured: NonNullable<typeof binding>, controller: AbortController) {
    sync();
    return !disposed && request === serial && !controller.signal.aborted &&
      binding?.owner === captured.owner && binding.generation === captured.generation;
  }
  function armRecheck(request: number, captured: NonNullable<typeof binding>, target: Target, started: number) {
    visibleUntil = started + VISIBLE_RECHECK_MS;
    const remaining = visibleUntil - now();
    if (remaining <= 0) throw Error("The reading response is already stale.");
    cancelRecheck = clock.schedule(() => {
      cancelRecheck = null;
      sync();
      if (!disposed && request === serial && binding?.owner === captured.owner && binding.generation === captured.generation)
        void load(target);
    }, remaining);
  }
  async function load(target: Target) {
    if (!syncUnchanged() || !binding) return;
    cancel();
    const request = serial, captured = binding, controller = new AbortController();
    active = controller; last = target;
    publish({ kind: "loading", target: target.kind });
    try {
      if (!current(request, captured, controller)) return;
      const capability = (await client.capabilities(captured.owner, controller.signal)).data;
      if (!current(request, captured, controller)) return;
      const matches = capability.features.filter(item => item.name === (target.kind === "feed" ? "feed.read" : "post.read"));
      if (!capability.supportedVersions.includes(API_VERSION)) {
        publish({ kind: "error", target: target.kind, problem: "update-required", retryAfterSeconds: null }); return;
      }
      if (matches.length !== 1 || !matches[0].available) {
        publish({ kind: "error", target: target.kind, problem: "unavailable", retryAfterSeconds: null }); return;
      }
      const started = now();
      if (target.kind === "feed") {
        const result = (await client.feed(captured.owner, target.query, controller.signal)).data;
        if (!current(request, captured, controller)) return;
        feedReturn = Object.freeze({ mode: result.mode, scope: result.scope, cursor: result.pageCursor });
        last = { kind: "feed", query: feedReturn };
        armRecheck(request, captured, last, started);
        publish({ kind: "feed", feed: immutable(result) });
      } else {
        const result = (await client.post(captured.owner, target.id, controller.signal)).data;
        if (!current(request, captured, controller)) return;
        armRecheck(request, captured, target, started);
        publish({ kind: "post", post: immutable(result), revealed: result.body.contentNote === null });
      }
    } catch (error) {
      if (!current(request, captured, controller)) return;
      cancelRecheck?.(); cancelRecheck = null; visibleUntil = null;
      if (error instanceof RequestClientError && error.responseError && error.status === 401 &&
        (error.code === "unauthenticated" || error.code === "account_changed")) {
        await session.reportReadRejection(error, captured.owner, captured.generation);
        return;
      }
      const confirmed = error instanceof RequestClientError && error.responseError;
      const problem: Problem = !confirmed ? "unavailable" :
        error.code === "not_found" || error.code === "forbidden" ? "not-found" :
        error.code === "cursor_invalid" || error.code === "conflict" ? "refresh-required" :
        error.code === "recovery_required" ? "recovery-required" :
        error.code === "unsupported_version" ? "update-required" : error.code === "rate_limited" ? "rate-limited" : "unavailable";
      publish({ kind: "error", target: target.kind, problem,
        retryAfterSeconds: confirmed && error.retryAfter !== undefined ? error.retryAfter : null });
    } finally {
      controller.abort();
      if (request === serial) active = null;
    }
  }
  return {
    getSnapshot(): ReadingSnapshot { sync(); return state; },
    subscribe(listener: () => void) {
      if (!disposed) listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    startFeed(mode: Query["mode"] = "latest") {
      const query = Object.freeze(apiContracts.feed.query.parse({ mode, scope: null, cursor: null }));
      return load({ kind: "feed", query });
    },
    openPost(id: string) { return load({ kind: "post", id: apiId.parse(id) }); },
    nextPage() {
      return syncUnchanged() && state.kind === "feed" && state.feed.page.nextCursor
        ? load({ kind: "feed", query: Object.freeze({ mode: state.feed.mode, scope: state.feed.scope, cursor: state.feed.page.nextCursor }) })
        : Promise.resolve();
    },
    backToFeed() { return syncUnchanged() ? load({ kind: "feed", query: feedReturn ?? latest() }) : Promise.resolve(); },
    refresh() { return syncUnchanged() ? load({ kind: "feed", query: { mode: feedReturn?.mode ?? "latest", scope: null, cursor: null } }) : Promise.resolve(); },
    retry() { return syncUnchanged() && last && state.kind === "error" ? load(last) : Promise.resolve(); },
    reveal() {
      if (syncUnchanged() && state.kind === "post" && !state.revealed) publish({ ...state, revealed: true });
    },
    /** Route changes drop content while retaining only this generation's bounded
     * feed return address. Session invalidation drops that address as well. */
    clear() { if (syncUnchanged()) { cancel(); last = null; publish(binding ? idle : concealed); } },
    dispose() {
      if (disposed) return;
      disposed = true; unsubscribe(); cancel(); binding = null; last = null; feedReturn = null;
      publish(concealed); listeners.clear();
    }
  };
}
