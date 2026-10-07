import { RequestClientError, type WireValue, type nativePasswordInput } from "@godschurches/shared-core";
import type { NativeIdentitySource } from "../platform/request-adapter.ts";
import type { Credential, CredentialCandidate, ClearResult, createCredentialVault } from "./credential-vault.ts";
import type { NativeClient } from "./native-client.ts";

type Account = Extract<Awaited<ReturnType<NativeClient["session"]>>["data"], { state: "authenticated" }>["account"];
type Phase = "concealed" | "verifying" | "signing-in" | "signed-out" | "ready" | "unavailable";
type Problem = "verification-unavailable" | "storage-unavailable" | "sign-in-required" | "sign-in-failed" | "sign-in-unconfirmed" | "session-expired" | null;
type RemoteResult = "not-needed" | "confirmed" | "unconfirmed";
export type SignOutResult = Readonly<{ local: ClearResult["status"]; remote: RemoteResult }>;
export type SessionSnapshot = Readonly<{
  generation: number;
  foreground: boolean;
  phase: Phase;
  account: Readonly<Account> | null;
  problem: Problem;
  cleanup: ClearResult["status"] | null;
  revocation: "none" | "pending" | "confirmed" | "unconfirmed";
}>;
export type SessionClock = {
  /** Monotonic elapsed milliseconds, never the device's adjustable wall clock. */
  now(): number;
  schedule(callback: () => void, delayMs: number): () => void;
};
export type SessionPorts = {
  vault: ReturnType<typeof createCredentialVault>;
  /** Private composition boundary. Never return a credential source to UI code. */
  createClient(source: NativeIdentitySource): NativeClient;
  clock?: SessionClock;
};

const defaultClock: SessionClock = {
  now: () => performance.now(),
  schedule(callback, delayMs) { const id = setTimeout(callback, delayMs); return () => clearTimeout(id); }
};
const deniedSession = (error: unknown) => error instanceof RequestClientError && error.responseError &&
  error.status === 401 && ["unauthenticated", "account_changed"].includes(error.code ?? "");
class ExpiredSession extends Error {}
class UnavailableStorage extends Error {
  readonly cleanup: ClearResult["status"] | null;
  constructor(cleanup: ClearResult["status"] | null) { super("Credential storage is unavailable."); this.cleanup = cleanup; }
}

/**
 * One controller per native process. Credentials and unverified account data
 * stay in this closure. UI receives only the verified snapshot. Native app
 * lifecycle integration and the real native transport are separate gates.
 */
export function createNativeSessionController(ports: SessionPorts) {
  const clock = ports.clock ?? defaultClock;
  let generation = 0, foreground = false, disposed = false;
  let credential: Credential | null = null;
  let candidate: CredentialCandidate | null = null;
  let expiresAt: number | null = null, lastTime = -Infinity;
  let cancelExpiry: (() => void) | null = null;
  let activityPending = false;
  let noKnownSession = false, unknownIssuance = false;
  let cleanupWarning: ClearResult["status"] | null = null;
  const work = new Set<AbortController>();
  const revocations = new Set<AbortController>();
  const listeners = new Set<() => void>();
  let state: SessionSnapshot = Object.freeze({ generation, foreground, phase: "concealed", account: null,
    problem: null, cleanup: null, revocation: "none" });
  const client = ports.createClient({ current: () => ({ identity: { owner: credential?.ownerId ?? null, generation }, credential }) });

  function now() {
    let value: number;
    try { value = clock.now(); } catch { throw new ExpiredSession(); }
    if (!Number.isFinite(value) || value < lastTime) throw new ExpiredSession();
    lastTime = value;
    return value;
  }
  function active(epoch: number) { return !disposed && foreground && epoch === generation; }
  function publish(update: Partial<SessionSnapshot>) {
    state = Object.freeze({ ...state, ...update, generation, foreground });
    for (const listener of listeners) { try { listener(); } catch { /* UI subscribers cannot prevent concealment. */ } }
  }
  function invalidate(phase: Phase, problem: Problem = null) {
    const epoch = ++generation;
    for (const controller of work) controller.abort();
    work.clear(); activityPending = false;
    cancelExpiry?.(); cancelExpiry = null;
    credential = null; candidate = null; expiresAt = null;
    publish({ phase, problem, account: null });
    return epoch;
  }
  function live(epoch: number) {
    if (!active(epoch) || expiresAt === null) return false;
    try { return now() < expiresAt; } catch { return false; }
  }
  function armExpiry(epoch: number) {
    cancelExpiry?.(); cancelExpiry = null;
    if (!live(epoch)) { if (active(epoch)) invalidate("unavailable", "session-expired"); return; }
    cancelExpiry = clock.schedule(() => {
      cancelExpiry = null;
      if (!active(epoch)) return;
      if (!live(epoch)) invalidate("unavailable", "session-expired");
      else armExpiry(epoch);
    }, Math.min(2147483647, Math.max(1, expiresAt! - now())));
  }
  function deadline(activity: Awaited<ReturnType<NativeClient["activity"]>>["data"], started: number) {
    const remaining = Math.min(Date.parse(activity.deadline), Date.parse(activity.absoluteExpiresAt)) - Date.parse(activity.serverTime);
    // Starting before the request is conservative about time spent in transit.
    // The server supplies the duration; this is not a local authorization policy.
    const until = started + remaining;
    if (!Number.isFinite(until) || remaining <= 0 || now() >= until) throw new ExpiredSession();
    return until;
  }
  async function verify(epoch: number, controller: AbortController) {
    const owner = credential!.ownerId;
    const session = await client.session(owner, controller.signal);
    if (!active(epoch)) return null;
    if (session.data.state !== "authenticated" || session.data.account.id !== owner) throw new Error("Session was not verified.");
    const started = now();
    const activity = await client.activity(owner, false, controller.signal);
    if (!active(epoch)) return null;
    const until = deadline(activity.data, started);
    return { account: Object.freeze({ ...session.data.account }), until };
  }
  async function clearLocal(binding?: CredentialCandidate): Promise<ClearResult> {
    let result: ClearResult;
    try { result = await ports.vault.clear(binding); } catch { result = { status: "unconfirmed" }; }
    if (result.status === "unconfirmed" || result.status === "cleanup-pending") cleanupWarning = result.status;
    else if (result.status === "cleared") cleanupWarning = null;
    return result;
  }
  async function rejectCurrentSession(binding: CredentialCandidate) {
    const clearing = clearLocal(binding);
    const clearedEpoch = invalidate("signed-out", "sign-in-required");
    const result = await clearing;
    if (active(clearedEpoch)) publish({ cleanup: result.status });
  }
  async function revoke(old: Credential, epoch: number): Promise<RemoteResult> {
    // Keep at most one old credential in a bounded revocation flight, with no
    // queue or retained retry token. A second rapid logout reports uncertainty.
    if (disposed || !foreground || revocations.size) return "unconfirmed";
    const controller = new AbortController(); revocations.add(controller);
    const captured = Object.freeze({ ownerId: old.ownerId, token: old.token });
    try {
      const revoker = ports.createClient({ current: () => ({ identity: { owner: captured.ownerId, generation: epoch }, credential: captured }) });
      await revoker.logout(captured.ownerId, controller.signal);
      return controller.signal.aborted ? "unconfirmed" : "confirmed";
    } catch (error) {
      return !controller.signal.aborted && error instanceof RequestClientError && error.responseError &&
        error.status === 401 && error.code === "unauthenticated" ? "confirmed" : "unconfirmed";
    } finally { revocations.delete(controller); }
  }
  async function abandonIssued(old: Credential, epoch: number, stored?: Awaited<ReturnType<SessionPorts["vault"]["replace"]>>) {
    // A save can finish just before the lifecycle callback invalidates its UI.
    // Clean only that exact nonce, never the replacement's record.
    const cleanup = stored?.status === "candidate" ? (await clearLocal(stored.candidate)).status :
      stored && "cleanup" in stored ? stored.cleanup : undefined;
    if (cleanup === "unconfirmed" || cleanup === "cleanup-pending") cleanupWarning = cleanup;
    const remote = await revoke(old, epoch);
    if (remote === "unconfirmed") unknownIssuance = true;
    if (!disposed && state.phase !== "ready" && state.phase !== "signing-in") publish({
      ...(cleanup === "unconfirmed" || cleanup === "cleanup-pending" ? { cleanup } : {}),
      ...(remote === "unconfirmed" ? { revocation: "unconfirmed" } : {})
    });
  }
  async function restore() {
    if (disposed || !foreground) return;
    const epoch = invalidate("verifying");
    if (!active(epoch)) return;
    noKnownSession = false;
    const controller = new AbortController(); work.add(controller);
    try {
      const stored = await ports.vault.readCandidate({ isCurrent: () => active(epoch) });
      if (!active(epoch)) return;
      if (stored.status !== "candidate") {
        const cleanup = "cleanup" in stored ? stored.cleanup ?? cleanupWarning ?? state.cleanup : stored.status === "empty" ?
          (stored.cleanupPending ? "cleanup-pending" : null) : cleanupWarning ?? state.cleanup;
        if (stored.status === "empty" && !stored.cleanupPending) cleanupWarning = null;
        if (stored.status === "empty" && !stored.cleanupPending && !unknownIssuance && state.revocation !== "unconfirmed") noKnownSession = true;
        publish({ phase: stored.status === "unavailable" ? "unavailable" : "signed-out", cleanup,
          problem: stored.status === "unavailable" ? "storage-unavailable" : null });
        return;
      }
      candidate = stored.candidate; credential = { ownerId: candidate.ownerId, token: candidate.token };
      const verified = await verify(epoch, controller);
      if (!verified || !active(epoch)) return;
      expiresAt = verified.until;
      if (!live(epoch)) throw new ExpiredSession();
      publish({ phase: "ready", account: verified.account, problem: null });
      armExpiry(epoch);
    } catch (error) {
      if (!active(epoch)) return;
      const binding = candidate;
      if (binding && deniedSession(error)) {
        await rejectCurrentSession(binding);
      } else invalidate("unavailable", error instanceof ExpiredSession ? "session-expired" : "verification-unavailable");
    } finally { controller.abort(); work.delete(controller); }
  }

  return {
    getSnapshot(): SessionSnapshot {
      if (state.phase === "ready" && !live(generation)) invalidate("unavailable", "session-expired");
      return state;
    },
    subscribe(listener: () => void) {
      if (!disposed) listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    /** Pass active AND focused. Android notification shade blur also conceals. */
    setForeground(value: boolean): Promise<void> {
      if (disposed || foreground === value) return Promise.resolve();
      foreground = value;
      if (value) return restore();
      if (state.phase === "signing-in" && !credential) unknownIssuance = true;
      invalidate("concealed");
      for (const controller of revocations) controller.abort();
      if (state.revocation === "pending") publish({ revocation: "unconfirmed" });
      return Promise.resolve();
    },
    retryVerification(): Promise<void> {
      return state.phase === "unavailable" ? restore() : Promise.resolve();
    },
    async signIn(input: WireValue<typeof nativePasswordInput>): Promise<void> {
      if (disposed || !foreground || state.phase !== "signed-out") return;
      const previouslyEmpty = noKnownSession;
      noKnownSession = false;
      const epoch = invalidate("signing-in");
      if (!active(epoch)) return;
      publish({ cleanup: null, revocation: "none" });
      if (!active(epoch)) return;
      const controller = new AbortController(); work.add(controller);
      let issued: Credential | null = null;
      try {
        const pending = client.signIn(input, { owner: null, generation: epoch }, controller.signal);
        input = { email: "", password: "" }; // Drop this frame's submitted values; never persist or log them.
        const result = await pending;
        issued = { ownerId: result.data.activity.owner, token: result.data.token };
        if (!active(epoch)) { await abandonIssued(issued, epoch); return; }
        credential = issued;
        const verified = await verify(epoch, controller);
        if (!verified || !active(epoch)) { await abandonIssued(issued, epoch); return; }
        expiresAt = verified.until;
        const stored = await ports.vault.replace({ isCurrent: () => live(epoch) }, issued);
        if (!active(epoch)) { await abandonIssued(issued, epoch, stored); return; }
        if (stored.status !== "candidate") throw new UnavailableStorage("cleanup" in stored ? stored.cleanup ?? null : null);
        candidate = stored.candidate;
        if (!live(epoch)) throw new ExpiredSession();
        cleanupWarning = null;
        publish({ phase: "ready", account: verified.account, problem: null });
        armExpiry(epoch);
      } catch (error) {
        if (!active(epoch)) { if (issued) await abandonIssued(issued, epoch); return; }
        // A successfully saved credential must not survive a failed publication.
        const clearing = candidate ? clearLocal(candidate) : null;
        const unconfirmed = error instanceof RequestClientError && error.dispatched && !error.responseError;
        if (unconfirmed && !issued) unknownIssuance = true;
        if (!issued && !unconfirmed) noKnownSession = previouslyEmpty;
        const failedEpoch = invalidate("signed-out", error instanceof UnavailableStorage ? "storage-unavailable" :
          error instanceof ExpiredSession ? "session-expired" : unconfirmed ? "sign-in-unconfirmed" : "sign-in-failed");
        if (active(failedEpoch)) publish({ cleanup: error instanceof UnavailableStorage ? error.cleanup : null, revocation: issued ? "pending" : "none" });
        const remote = issued ? revoke(issued, epoch) : Promise.resolve<RemoteResult>("not-needed");
        const [local, revoked] = await Promise.all([clearing, remote]);
        if (active(failedEpoch)) {
          if (revoked === "confirmed" && !unknownIssuance) noKnownSession = true;
          publish({ ...(local ? { cleanup: local.status } : {}), revocation: revoked === "not-needed" ? "none" : revoked });
        }
      } finally { controller.abort(); work.delete(controller); }
    },
    async signOut(): Promise<SignOutResult> {
      if (disposed) return { local: "unconfirmed", remote: "unconfirmed" };
      const old = credential, epoch = generation;
      if (state.phase === "signing-in" && !old) unknownIssuance = true;
      const local = clearLocal(); // Synchronously locks restoration and enqueues persistent logout.
      const logoutEpoch = invalidate(foreground ? "signed-out" : "concealed");
      if (!disposed && generation === logoutEpoch) publish({ cleanup: null, revocation: old ? "pending" : "none" });
      const remote = old ? revoke(old, epoch) : Promise.resolve<RemoteResult>(noKnownSession && !unknownIssuance ? "not-needed" : "unconfirmed");
      const [cleared, revoked] = await Promise.all([local, remote]);
      if (!disposed && generation === logoutEpoch) {
        if (revoked === "confirmed" && !unknownIssuance) noKnownSession = true;
        publish({ cleanup: cleared.status, revocation: revoked === "not-needed" ? "none" : revoked });
      } else if (!disposed && ["concealed", "signed-out", "unavailable"].includes(state.phase) && cleanupWarning) {
        publish({ cleanup: cleanupWarning });
      }
      // No late unguarded vault.clear: a newer sign-in may already be saved.
      return Object.freeze({ local: cleared.status, remote: revoked });
    },
    /** Explicit foreground interaction only. Never call from a background timer. */
    async recordForegroundActivity(): Promise<void> {
      if (state.phase !== "ready" || !live(generation) || activityPending) return;
      const epoch = generation, owner = credential!.ownerId;
      const controller = new AbortController(); work.add(controller); activityPending = true;
      try {
        const started = now();
        const activity = await client.activity(owner, true, controller.signal);
        if (!active(epoch) || state.phase !== "ready") return;
        expiresAt = deadline(activity.data, started); armExpiry(epoch);
      } catch (error) {
        if (active(epoch)) {
          if (candidate && deniedSession(error)) await rejectCurrentSession(candidate);
          else invalidate("unavailable", error instanceof ExpiredSession ? "session-expired" : "verification-unavailable");
        }
      } finally { controller.abort(); work.delete(controller); if (epoch === generation) activityPending = false; }
    },
    dispose() {
      if (disposed) return;
      foreground = false; disposed = true; invalidate("concealed");
      for (const controller of revocations) controller.abort();
      listeners.clear();
    }
  };
}
