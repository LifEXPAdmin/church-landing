import type { AppDestination } from "@godschurches/shared-core";
import type { createNativeRuntime } from "../session/runtime";

type Runtime = Pick<ReturnType<typeof createNativeRuntime>, "session" | "open">;
export type LinkNotice = "opened" | "sign-in-required" | "unavailable" | null;
export type NativeLinkSource = {
  initial(): Promise<string | null>;
  subscribe(listener: (url: string) => void): () => void;
};

/** One normalized address can wait for the current verification or the next
 * resume when Android delivers onNewIntent while paused. No raw link, credential
 * or content survives here. The runtime still owns guest return and fresh reads. */
export function observeNativeLinks(runtime: Runtime, source: NativeLinkSource,
  parse: (url: string) => AppDestination | null, notice: (value: LinkNotice) => void) {
  let mounted = true, revision = 0, arrival = 0;
  let state = runtime.session.getSnapshot();
  let owner = state.account?.id ?? null;
  let initialValid = true;
  const initialStartup = state.generation === 0 && !state.foreground && state.phase === "concealed";
  let pending: { destination: AppDestination; generation: number; owner: string | null; waitForResume: boolean } | null = null;
  let stopLinks = () => {};
  const publish = (value: LinkNotice) => { if (mounted) { try { notice(value); } catch { /* Presentation cannot block invalidation. */ } } };
  async function open(destination: AppDestination) {
    const request = ++revision;
    try {
      const result = await runtime.open(destination);
      if (!mounted || request !== revision) return;
      publish(result === "opened" || result === "sign-in-required" ? result : "unavailable");
    } catch { if (mounted && request === revision) publish("unavailable"); }
  }
  function receive(url: string | null) {
    if (!mounted || !url) return;
    let destination: AppDestination | null;
    try { destination = parse(url); } catch { return; }
    if (!destination) return;
    const received = ++arrival, observed = revision;
    const current = runtime.session.getSnapshot();
    // Expiry enforcement can synchronously sign out, dispose or deliver a newer
    // link through subscribers. The outer callback must not overwrite that work.
    if (!mounted || received !== arrival || observed !== revision) return;
    pending = null;
    if ((!current.foreground && current.phase === "concealed") || (current.foreground && current.phase === "verifying")) {
      revision++;
      pending = { destination, generation: current.generation, owner, waitForResume: !current.foreground };
    } else void open(destination);
  }
  const stopSession = runtime.session.subscribe(() => {
    const current = runtime.session.getSnapshot();
    if (!mounted) return;
    const previous = state;
    state = current;
    const nextGeneration = current.generation === previous.generation + 1;
    const resuming = nextGeneration && !previous.foreground && previous.phase === "concealed" &&
      current.foreground && current.phase === "verifying";
    const concealing = nextGeneration && previous.foreground && !current.foreground && current.phase === "concealed";
    // Retain only an owner identifier through the lifecycle handoff. Explicit
    // session replacement/logout/failure breaks that continuity, even when hidden.
    if (current.phase === "ready") owner = current.account?.id ?? null;
    else if (["signed-out", "signing-in", "unavailable"].includes(current.phase) ||
      (current.generation !== previous.generation && !resuming && !concealing)) owner = null;
    if (pending?.waitForResume && resuming && pending.generation === previous.generation)
      pending = { ...pending, generation: current.generation, waitForResume: false };
    else if (pending && (pending.generation !== current.generation || (!current.foreground && !pending.waitForResume))) pending = null;
    if (current.generation !== previous.generation || !current.foreground) {
      // getInitialURL may resolve on either side of startup verification. Only
      // that first expected transition can retain it; later lifecycle changes
      // invalidate it independently of whether a newer URL has arrived.
      if (!(initialStartup && previous.generation === 0 && resuming)) initialValid = false;
      revision++; publish(null);
    }
    if (!mounted || state !== current) return; // Presentation may reenter or dispose.
    if (pending && current.foreground && (current.phase === "ready" || current.phase === "signed-out")) {
      const accepted = pending.owner === null || (current.phase === "ready" && pending.owner === current.account?.id);
      const destination = pending.destination; pending = null;
      if (accepted) void open(destination);
    } else if (current.phase === "unavailable" || current.phase === "signing-in") pending = null;
  });
  function stop() {
    if (!mounted) return;
    mounted = false; revision++; arrival++; pending = null;
    try { stopSession(); } finally { try { stopLinks(); } catch { /* Queued callbacks still check mounted. */ } }
  }
  try {
    const initial = arrival;
    stopLinks = source.subscribe(receive);
    void source.initial().then(url => { if (mounted && initialValid && arrival === initial) receive(url); }).catch(() => {});
  } catch { stop(); }
  return stop;
}
