import { API_VERSION, RequestClientError, apiContracts, type RequestCancellation, type WireValue } from "@godschurches/shared-core";
import type { NativeClient } from "../session/native-client.ts";
import type { createNativeSessionController } from "../session/session-controller.ts";

type Session = Pick<ReturnType<typeof createNativeSessionController>,
  "getSnapshot" | "subscribe" | "reportReadRejection" | "captureVerifiedContinuity">;
type Client = Pick<NativeClient, "capabilities" | "reactionPreferences" | "prepareReactionPreferences">;
type Choice = WireValue<typeof apiContracts.setReactionPreferences.body>;
export type ReactionPreferencesProblem = "unavailable" | "feature-unavailable" | "refresh-required" |
  "recovery-required" | "update-required" | "rate-limited" | "unconfirmed";
export type ReactionPreferencesSnapshot = Readonly<{
  phase: "concealed" | "closed" | "loading" | "ready" | "saving" | "unconfirmed" | "error";
  open: boolean; hasPending: boolean; hideCounts: boolean | null; recoveryRequired: boolean;
  canChoose: boolean; canRetry: boolean; canRefresh: boolean; canClose: boolean;
  problem: ReactionPreferencesProblem | null; retryAfterSeconds: number | null;
}>;
type View = { owner: string; generation: number;
  value: Awaited<ReturnType<Client["reactionPreferences"]>>["data"] | null; writable: boolean };
type Pending = { owner: string; input: Readonly<Choice>; continuity: () => boolean;
  prepared: ReturnType<Client["prepareReactionPreferences"]> | null; generation: number;
  dispatched: boolean; uncertain: boolean; busy: boolean };
const hidden: ReactionPreferencesSnapshot = Object.freeze({ phase: "concealed", open: false, hasPending: false,
  hideCounts: null, recoveryRequired: false, canChoose: false, canRetry: false, canRefresh: false, canClose: false,
  problem: null, retryAfterSeconds: null });
function cancellation(signal: AbortSignal): RequestCancellation {
  return { get cancelled() { return signal.aborted; }, subscribe(listener) {
    signal.addEventListener("abort", listener, { once: true });
    return () => signal.removeEventListener("abort", listener);
  } };
}
function problem(error: unknown): ReactionPreferencesProblem {
  if (!(error instanceof RequestClientError) || !error.responseError) return "unavailable";
  return error.code === "conflict" || error.code === "validation" ? "refresh-required" :
    error.code === "recovery_required" ? "recovery-required" : error.code === "unsupported_version" ? "update-required" :
    error.code === "feature_unavailable" || error.code === "forbidden" ? "feature-unavailable" :
    error.code === "rate_limited" ? "rate-limited" : error.code === "unconfirmed" ? "unconfirmed" : "unavailable";
}

/** Explicit account panel, one immutable in-memory choice, no timer or outbox.
 * A pending write blocks reading until its exact receipt is reconciled: a GET
 * racing an interrupted POST cannot establish that the POST will never commit. */
export function createNativeReactionPreferencesController(session: Session, client: Client, mutationId?: () => string) {
  let disposed = false, syncing = false, serial = 0, visible = false;
  let view: View | null = null, pending: Pending | null = null;
  let flight: { controller: AbortController; command: Pending | null } | null = null;
  let phase: ReactionPreferencesSnapshot["phase"] = "closed", issue: ReactionPreferencesProblem | null = null;
  let retryAfter: number | null = null, state = hidden;
  const listeners = new Set<() => void>();
  function publish() {
    const next: ReactionPreferencesSnapshot = !visible ? hidden : Object.freeze({
      phase: view ? phase : "closed", open: !!view, hasPending: !!pending,
      hideCounts: view?.value ? view.value.hideAuthoredReactionCounts || view.value.recoveryRequired : null,
      recoveryRequired: view?.value?.recoveryRequired ?? false,
      canChoose: phase === "ready" && !!view?.value && view.writable && !pending && !!mutationId,
      canRetry: !!view?.value && !!view.writable && !!pending && !pending.busy && !flight &&
        phase === "unconfirmed" && issue === "unconfirmed",
      canRefresh: !!view && !flight && !pending?.busy,
      canClose: !!view && !pending, problem: view ? issue : null, retryAfterSeconds: view ? retryAfter : null
    });
    if (Object.keys(next).every(key => next[key as keyof ReactionPreferencesSnapshot] === state[key as keyof ReactionPreferencesSnapshot])) return;
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
    try {
      const account = session.getSnapshot();
      visible = account.foreground && account.phase === "ready" && !!account.account;
      if (!visible) {
        cancel(); view = null; issue = null; retryAfter = null;
        if (["signed-out", "signing-in"].includes(account.phase)) pending = null;
        if (pending) pending.prepared = null;
      } else {
        // A continuity check may itself expire the session through its clock.
        const continuity = pending?.continuity(), after = session.getSnapshot();
        if (after !== account) {
          visible = false; cancel(); view = null;
          if (["signed-out", "signing-in"].includes(after.phase)) pending = null;
          if (pending) pending.prepared = null;
        } else {
          if (pending && !continuity) pending = null;
          if (view && (view.owner !== account.account!.id || view.generation !== account.generation)) { cancel(); view = null; }
        }
      }
      publish();
    } finally { syncing = false; }
  }
  function current(request: number, target: View, controller: AbortController) {
    sync();
    return !disposed && visible && view === target && serial === request && !controller.signal.aborted;
  }
  async function rejectSession(error: unknown, target: View) {
    if (error instanceof RequestClientError && error.responseError && error.status === 401 &&
      (error.code === "unauthenticated" || error.code === "account_changed")) {
      await session.reportReadRejection(error, target.owner, target.generation); return true;
    }
    return false;
  }
  async function load(target: View) {
    if (disposed || !visible || view !== target) return;
    cancel();
    const request = serial, controller = new AbortController();
    flight = { controller, command: null };
    target.value = null; target.writable = false; phase = "loading"; issue = null; retryAfter = null; publish();
    try {
      const capability = (await client.capabilities(target.owner, controller.signal)).data;
      if (!current(request, target, controller)) return;
      if (!capability.supportedVersions.includes(API_VERSION)) { phase = "error"; issue = "update-required"; return; }
      const feature = (name: string) => {
        const matches = capability.features.filter(item => item.name === name);
        return matches.length === 1 && matches[0].available;
      };
      if (!feature("reactionPreferences.read")) { phase = "error"; issue = "feature-unavailable"; return; }
      target.writable = feature("reactionPreferences.write");
      const result = await client.reactionPreferences(target.owner, controller.signal);
      if (!current(request, target, controller)) return;
      target.value = Object.freeze(result.data);
      phase = pending ? "unconfirmed" : "ready"; issue = pending ? "unconfirmed" : null;
    } catch (error) {
      if (!current(request, target, controller) || await rejectSession(error, target) || !current(request, target, controller)) return;
      phase = "error"; issue = problem(error);
      retryAfter = error instanceof RequestClientError && error.responseError ? error.retryAfter ?? null : null;
    } finally { controller.abort(); if (request === serial) { flight = null; publish(); } }
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
        command.prepared = client.prepareReactionPreferences(command.owner, command.input);
        command.generation = target.generation;
      }
      await command.prepared.run({ cancellation: cancellation(controller.signal), onDispatch() {
        if (!current(request, target, controller) || pending !== command || !command.continuity()) { controller.abort(); return; }
        command.dispatched = true;
      } });
      if (!current(request, target, controller) || pending !== command || !command.continuity()) return;
      // A historical receipt confirms the command, never the current choice.
      pending = null; flight = null; command.busy = false;
      await load(target);
    } catch (error) {
      if (!current(request, target, controller) || pending !== command) return;
      const confirmed = error instanceof RequestClientError && error.responseError;
      command.uncertain ||= error instanceof RequestClientError && error.dispatched && (!confirmed || error.code === "unconfirmed");
      if (!command.uncertain) pending = null;
      if (await rejectSession(error, target) || !current(request, target, controller)) return;
      phase = command.uncertain ? "unconfirmed" : "error";
      issue = command.uncertain && !confirmed ? "unconfirmed" : problem(error);
      retryAfter = confirmed ? error.retryAfter ?? null : null;
      if (!command.uncertain || issue !== "unconfirmed") { target.value = null; target.writable = false; }
    } finally {
      command.busy = false; controller.abort(); if (request === serial) flight = null;
      sync(); publish();
    }
  }
  function admitted(expected: ReactionPreferencesSnapshot) { sync(); return !disposed && visible && state === expected; }
  const unsubscribe = session.subscribe(sync); sync();
  return {
    getSnapshot(): ReactionPreferencesSnapshot { sync(); return state; },
    subscribe(listener: () => void) { if (!disposed) listeners.add(listener); return () => { listeners.delete(listener); }; },
    open(expected: ReactionPreferencesSnapshot) {
      if (!admitted(expected) || view) return Promise.resolve();
      const account = session.getSnapshot();
      if (!admitted(expected) || !account.account) return Promise.resolve();
      view = { owner: account.account.id, generation: account.generation, value: null, writable: false };
      return load(view);
    },
    close(expected: ReactionPreferencesSnapshot) {
      if (!admitted(expected) || !state.canClose) return false;
      cancel(); view = null; publish(); return true;
    },
    async choose(expected: ReactionPreferencesSnapshot, hideAuthoredReactionCounts: boolean) {
      if (!admitted(expected) || !state.canChoose || !view?.value || pending || typeof hideAuthoredReactionCounts !== "boolean" ||
        hideAuthoredReactionCounts === view.value.hideAuthoredReactionCounts && !view.value.recoveryRequired) return;
      const target = view, continuity = session.captureVerifiedContinuity();
      if (!continuity || !mutationId) return;
      try {
        const input = Object.freeze(apiContracts.setReactionPreferences.body.parse({
          mutationId: mutationId(), expectedVersion: target.value!.version, hideAuthoredReactionCounts
        }));
        if (!admitted(expected) || view !== target || !continuity()) return;
        pending = { owner: target.owner, input, continuity, prepared: null, generation: target.generation,
          dispatched: false, uncertain: false, busy: false };
        await send(pending, target);
      } catch { if (view === target && admitted(expected)) { phase = "error"; issue = "unavailable"; publish(); } }
    },
    retry(expected: ReactionPreferencesSnapshot) {
      return admitted(expected) && state.canRetry && pending && view ? send(pending, view) : Promise.resolve();
    },
    refresh(expected: ReactionPreferencesSnapshot) {
      return admitted(expected) && state.canRefresh && view ? load(view) : Promise.resolve();
    },
    clearPending() { cancel(); pending = null; view = null; sync(); publish(); },
    dispose() {
      if (disposed) return;
      disposed = true; unsubscribe(); cancel(); pending = null; view = null; visible = false; publish(); listeners.clear();
    }
  };
}
