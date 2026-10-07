import type { AppDestination } from "@godschurches/shared-core";
import type { createNativeRuntime } from "../session/runtime";

type Runtime = Pick<ReturnType<typeof createNativeRuntime>, "session" | "open">;
export type LinkNotice = "opened" | "sign-in-required" | "unavailable" | null;
export type NativeLinkSource = {
  initial(): Promise<string | null>;
  subscribe(listener: (url: string) => void): () => void;
};

/** One normalized address can wait for the current verification only. No raw
 * link, credential or content survives here. The runtime owns guest return and
 * fresh authorization; this observer never replays a link after account change. */
export function observeNativeLinks(runtime: Runtime, source: NativeLinkSource,
  parse: (url: string) => AppDestination | null, notice: (value: LinkNotice) => void) {
  let mounted = true, revision = 0, arrival = 0;
  let generation = runtime.session.getSnapshot().generation;
  let pending: { destination: AppDestination; generation: number } | null = null;
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
    arrival++;
    const state = runtime.session.getSnapshot();
    if (!mounted) return;
    if (state.foreground && state.phase === "verifying") pending = { destination, generation: state.generation };
    else { pending = null; void open(destination); }
  }
  const stopSession = runtime.session.subscribe(() => {
    const state = runtime.session.getSnapshot();
    if (!mounted) return;
    if (state.generation !== generation || !state.foreground) {
      generation = state.generation; revision++; arrival++; publish(null);
    }
    if (!state.foreground || pending && pending.generation !== state.generation) pending = null;
    if (pending && (state.phase === "ready" || state.phase === "signed-out")) {
      const destination = pending.destination; pending = null; void open(destination);
    } else if (state.phase === "unavailable") pending = null;
  });
  function stop() {
    if (!mounted) return;
    mounted = false; revision++; arrival++; pending = null;
    try { stopSession(); } finally { try { stopLinks(); } catch { /* Queued callbacks still check mounted. */ } }
  }
  try {
    const initial = arrival;
    stopLinks = source.subscribe(receive);
    void source.initial().then(url => { if (mounted && arrival === initial) receive(url); }).catch(() => {});
  } catch { stop(); }
  return stop;
}
