import { API_VERSION, RequestClientError, apiContracts, type RequestCancellation, type WireValue } from "@godschurches/shared-core";
import type { NativeClient } from "../session/native-client.ts";
import type { createNativeSessionController } from "../session/session-controller.ts";
import type { createNativeReadController, ReadingSnapshot } from "../reading/read-controller.ts";

type Session = Pick<ReturnType<typeof createNativeSessionController>,
  "getSnapshot" | "subscribe" | "reportReadRejection" | "captureVerifiedContinuity">;
type Reading = Pick<ReturnType<typeof createNativeReadController>, "getSnapshot" | "subscribe">;
type Client = Pick<NativeClient, "capabilities" | "like" | "prepareLike">;
type Detail = Extract<ReadingSnapshot, { kind: "post" }>["post"];
type Choice = WireValue<typeof apiContracts.setLike.body>;
export type PostLikeProblem = "unavailable" | "feature-unavailable" | "not-found" | "refresh-required" |
  "recovery-required" | "update-required" | "rate-limited" | "unconfirmed";
export type PostLikeSnapshot = Readonly<{
  phase: "concealed" | "idle" | "loading" | "ready" | "saving" | "unconfirmed" | "error";
  currentPostId: string | null;
  liked: boolean | null;
  count: number | null;
  canChoose: boolean;
  canRetry: boolean;
  canRefresh: boolean;
  canReviewPending: boolean;
  hasPending: boolean;
  problem: PostLikeProblem | null;
  retryAfterSeconds: number | null;
}>;
type View = {
  owner: string; generation: number; post: Detail; interactionId: string;
  like: Awaited<ReturnType<Client["like"]>>["data"] | null; writable: boolean;
};
type Pending = {
  owner: string; postId: string; interactionId: string; input: Readonly<Choice>; continuity: () => boolean;
  prepared: ReturnType<Client["prepareLike"]> | null; generation: number;
  dispatched: boolean; uncertain: boolean; busy: boolean;
};
const hidden: PostLikeSnapshot = Object.freeze({
  phase: "concealed", currentPostId: null, liked: null, count: null, canChoose: false, canRetry: false,
  canRefresh: false, canReviewPending: false, hasPending: false, problem: null, retryAfterSeconds: null
});
function cancellation(signal: AbortSignal): RequestCancellation {
  return { get cancelled() { return signal.aborted; }, subscribe(listener) {
    signal.addEventListener("abort", listener, { once: true });
    return () => signal.removeEventListener("abort", listener);
  } };
}
function problem(error: unknown): PostLikeProblem {
  if (!(error instanceof RequestClientError) || !error.responseError) return "unavailable";
  return error.code === "forbidden" || error.code === "not_found" ? "not-found" :
    error.code === "conflict" || error.code === "validation" ? "refresh-required" :
    error.code === "recovery_required" ? "recovery-required" :
    error.code === "unsupported_version" ? "update-required" :
    error.code === "feature_unavailable" ? "feature-unavailable" :
    error.code === "rate_limited" ? "rate-limited" :
    error.code === "unconfirmed" ? "unconfirmed" : "unavailable";
}

/** One detail and one immutable in-memory command. The existing session, reader,
 * shared request executor and server retain their separate authority. */
export function createNativePostLikeController(session: Session, reading: Reading, client: Client,
  mutationId?: () => string) {
  let disposed = false, syncing = false, serial = 0, visible = false;
  let view: View | null = null, pending: Pending | null = null;
  let flight: { controller: AbortController; command: Pending | null } | null = null;
  let state: PostLikeSnapshot = hidden;
  let phase: PostLikeSnapshot["phase"] = "idle", issue: PostLikeProblem | null = null, retryAfter: number | null = null;
  const listeners = new Set<() => void>();
  function publish() {
    const primary = view?.post.repost?.kind === "PLAIN" ? view.post.repost.source : view?.post;
    const samePending = !!pending && view?.post.id === pending.postId;
    const next: PostLikeSnapshot = !visible ? hidden : Object.freeze({
      phase, currentPostId: view?.post.id ?? null, liked: view?.like?.liked ?? null,
      count: primary?.likeCount === null ? null : view?.like?.count ?? null,
      canChoose: phase === "ready" && !!view?.like && view.writable && !pending && !!mutationId,
      canRetry: samePending && !!view?.like && !!view.writable && !pending?.busy && !flight &&
        phase === "unconfirmed" && issue === "unconfirmed",
      canRefresh: !!view && !flight && !pending?.busy && phase !== "loading" && phase !== "saving",
      canReviewPending: !!pending && !samePending,
      hasPending: !!pending, problem: issue, retryAfterSeconds: retryAfter
    });
    if (Object.keys(next).every(key => next[key as keyof PostLikeSnapshot] === state[key as keyof PostLikeSnapshot])) return;
    state = next;
    for (const listener of listeners) { try { listener(); } catch { /* Concealment must complete. */ } }
  }
  function cancel() {
    serial++;
    const old = flight; flight = null;
    if (old?.command && pending === old.command) {
      if (old.command.dispatched) old.command.uncertain = true;
      else pending = null;
    }
    old?.controller.abort();
  }
  function sync() {
    if (syncing || disposed) return;
    syncing = true;
    let load: View | null = null;
    try {
      let account = session.getSnapshot();
      const current = reading.getSnapshot();
      // The reader can expire access and notify during its getter.
      const after = session.getSnapshot();
      if (after !== account) account = after;
      const ready = account.foreground && account.phase === "ready" && !!account.account;
      visible = ready;
      if (!ready) {
        cancel(); view = null; phase = "concealed"; issue = null; retryAfter = null;
        if (["signed-out", "signing-in"].includes(account.phase)) pending = null;
        if (pending) pending.prepared = null;
        publish(); return;
      }
      if (pending && !pending.continuity()) pending = null;
      if (current.kind !== "post" || reading.getSnapshot() !== current) {
        if (view || flight) cancel();
        view = null; phase = "idle"; issue = null; retryAfter = null; publish(); return;
      }
      const primary = current.post.repost?.kind === "PLAIN" ? current.post.repost.source : current.post;
      if (!primary) {
        cancel(); view = null; phase = "idle"; issue = null; retryAfter = null; publish(); return;
      }
      if (view?.post === current.post && view.owner === account.account!.id && view.generation === account.generation) return;
      cancel();
      view = { owner: account.account!.id, generation: account.generation, post: current.post,
        interactionId: primary.id, like: null, writable: false };
      issue = null; retryAfter = null;
      if (!mutationId) { phase = "error"; issue = "feature-unavailable"; publish(); return; }
      phase = "loading"; load = view; publish();
    } finally { syncing = false; }
    if (load) void loadView(load);
  }
  function current(request: number, target: View, controller: AbortController) {
    sync();
    return !disposed && visible && view === target && request === serial && !controller.signal.aborted;
  }
  async function rejectSession(error: unknown, target: View) {
    if (error instanceof RequestClientError && error.responseError && error.status === 401 &&
      (error.code === "unauthenticated" || error.code === "account_changed")) {
      await session.reportReadRejection(error, target.owner, target.generation);
      return true;
    }
    return false;
  }
  async function loadView(target: View) {
    if (disposed || view !== target || !visible) return;
    cancel();
    const request = serial, controller = new AbortController();
    flight = { controller, command: null };
    target.like = null; target.writable = false; phase = "loading"; issue = null; retryAfter = null; publish();
    try {
      const capability = (await client.capabilities(target.owner, controller.signal)).data;
      if (!current(request, target, controller)) return;
      if (!capability.supportedVersions.includes(API_VERSION)) {
        phase = "error"; issue = "update-required"; return;
      }
      const feature = (name: string) => {
        const matches = capability.features.filter(item => item.name === name);
        return matches.length === 1 && matches[0].available;
      };
      if (!feature("likes.read")) { phase = "error"; issue = "feature-unavailable"; return; }
      target.writable = feature("likes.write");
      const result = await client.like(target.owner, target.post.id, target.interactionId, controller.signal);
      if (!current(request, target, controller)) return;
      target.like = Object.freeze(result.data);
      phase = pending?.postId === target.post.id ? "unconfirmed" : "ready";
      issue = phase === "unconfirmed" ? "unconfirmed" : null;
    } catch (error) {
      if (!current(request, target, controller)) return;
      if (await rejectSession(error, target)) return;
      if (!current(request, target, controller)) return;
      target.like = null; phase = "error"; issue = problem(error);
      retryAfter = error instanceof RequestClientError && error.responseError ? error.retryAfter ?? null : null;
    } finally {
      controller.abort();
      if (request === serial) { flight = null; publish(); }
    }
  }
  async function send(command: Pending, target: View) {
    if (command.busy || pending !== command || view !== target || !command.continuity()) return;
    cancel();
    if (pending !== command) return;
    const request = serial, controller = new AbortController();
    flight = { controller, command }; command.busy = true;
    phase = "saving"; issue = null; retryAfter = null; publish();
    try {
      if (!current(request, target, controller) || pending !== command || !command.continuity()) return;
      if (!command.prepared || command.generation !== target.generation) {
        command.prepared = client.prepareLike(command.owner, command.postId, command.interactionId, command.input);
        command.generation = target.generation;
      }
      await command.prepared.run({ cancellation: cancellation(controller.signal), onDispatch() {
        if (!current(request, target, controller) || pending !== command || !command.continuity()) {
          controller.abort(); return;
        }
        command.dispatched = true;
      } });
      if (!current(request, target, controller) || pending !== command || !command.continuity()) return;
      // Historical receipt reconciled. Only a new authorized GET supplies state.
      pending = null; flight = null; command.busy = false;
      await loadView(target);
    } catch (error) {
      if (!current(request, target, controller) || pending !== command) return;
      const uncertain = command.uncertain || (error instanceof RequestClientError && error.dispatched &&
        (!error.responseError || error.code === "unconfirmed"));
      command.uncertain = uncertain;
      if (!uncertain) pending = null;
      if (await rejectSession(error, target)) return;
      if (!current(request, target, controller)) return;
      const confirmed = error instanceof RequestClientError && error.responseError;
      issue = uncertain && !confirmed ? "unconfirmed" : problem(error);
      phase = uncertain ? "unconfirmed" : "error";
      retryAfter = confirmed ? error.retryAfter ?? null : null;
      // A paused/denied retry does not erase the earlier uncertain identity.
      // Require an explicit fresh capability/state check before another attempt.
      if (!uncertain || issue !== "unconfirmed") { target.like = null; target.writable = false; }
    } finally {
      command.busy = false; controller.abort();
      if (request === serial) flight = null;
      sync(); publish();
    }
  }
  function admitted(expected: PostLikeSnapshot) {
    sync();
    return !disposed && visible && state === expected;
  }
  const unsubscribeSession = session.subscribe(sync), unsubscribeReading = reading.subscribe(sync);
  sync();
  return {
    getSnapshot(): PostLikeSnapshot { sync(); return state; },
    subscribe(listener: () => void) { if (!disposed) listeners.add(listener); return () => { listeners.delete(listener); }; },
    async setLike(expected: PostLikeSnapshot, desired: boolean) {
      if (!admitted(expected) || !state.canChoose || !view?.like || pending || typeof desired !== "boolean" || desired === view.like.liked) return;
      const target = view, continuity = session.captureVerifiedContinuity();
      if (!continuity || !mutationId) return;
      try {
        const input = Object.freeze(apiContracts.setLike.body.parse({
          mutationId: mutationId(), expectedVersion: target.like!.version, desired
        }));
        if (!admitted(expected) || view !== target || !continuity()) return;
        const command: Pending = { owner: target.owner, postId: target.post.id, interactionId: target.interactionId,
          input, continuity, prepared: null, generation: target.generation, dispatched: false, uncertain: false, busy: false };
        pending = command; await send(command, target);
      } catch {
        if (view === target && admitted(expected)) { phase = "error"; issue = "unavailable"; publish(); }
      }
    },
    retryLike(expected: PostLikeSnapshot) {
      return admitted(expected) && state.canRetry && pending && view ? send(pending, view) : Promise.resolve();
    },
    refreshLike(expected: PostLikeSnapshot) {
      return admitted(expected) && state.canRefresh && view ? loadView(view) : Promise.resolve();
    },
    pendingPost(expected: PostLikeSnapshot): string | null {
      return admitted(expected) && state.canReviewPending && pending?.continuity() ? pending.postId : null;
    },
    clearPending() {
      cancel(); pending = null;
      if (view) { view.like = null; phase = "error"; issue = "unavailable"; }
      sync(); publish();
    },
    dispose() {
      if (disposed) return;
      disposed = true; unsubscribeSession(); unsubscribeReading(); cancel(); pending = null; view = null;
      visible = false; publish(); listeners.clear();
    }
  };
}
