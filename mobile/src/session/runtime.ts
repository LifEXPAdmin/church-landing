import type { AppDestination } from "@godschurches/shared-core";
import { createNativeRequestAdapter, type NativeApiConfiguration, type NativeWire } from "../platform/request-adapter.ts";
import { createSessionNavigation } from "../navigation/session-navigation.ts";
import type { NativeNavigationAvailability } from "../navigation/availability.ts";
import { createNativeReadController, type ReadingSnapshot } from "../reading/read-controller.ts";
import { createNativeClient, type NativeClient } from "./native-client.ts";
import { createNativeSessionController, type SessionPorts } from "./session-controller.ts";

/** Private composition. The app must deliberately supply an accepted native
 * wire and implemented renderers. No native module or network activates on import. */
export function createNativeRuntime(options: {
  configuration: NativeApiConfiguration;
  wire: NativeWire;
  vault: SessionPorts["vault"];
  clock?: SessionPorts["clock"];
  availability?: NativeNavigationAvailability;
}) {
  let primary: NativeClient | null = null;
  const session = createNativeSessionController({ vault: options.vault, clock: options.clock,
    createClient(source) {
      const client = createNativeClient(createNativeRequestAdapter(options.configuration, source, options.wire));
      // Later detached revocation clients must never replace the read client.
      primary ??= client;
      return client;
    }
  });
  const navigation = createSessionNavigation(session, options.availability ?? { screens: [], resources: [] });
  const reading = createNativeReadController(session, primary!, options.clock);
  const unsubscribe = navigation.subscribe(reading.clear);
  let disposed = false, intent = 0;
  const current = (operation: number) => !disposed && operation === intent;
  async function loadCurrent(generation: number, operation: number) {
    const state = navigation.getSnapshot();
    if (!current(operation) || !state.owner || state.generation !== generation) return;
    if (state.destination?.kind === "post") await reading.openPost(state.destination.postId);
    else if (state.destination?.kind === "screen" && state.destination.screen === "home") await reading.startFeed();
  }
  function afterVerification(work: Promise<void>, operation: number) {
    const generation = session.getSnapshot().generation;
    return work.then(() => { if (current(operation)) return loadCurrent(generation, operation); });
  }
  function atHome(read: () => Promise<void>) {
    if (disposed) return Promise.resolve();
    const prior = intent;
    const opened = navigation.open({ kind: "screen", screen: "home" });
    const state = navigation.getSnapshot();
    if (!current(prior) || opened !== "opened" || !state.owner || state.destination?.kind !== "screen" || state.destination.screen !== "home")
      return Promise.resolve();
    intent++; return read();
  }
  function readCommand(allowed: (state: ReadingSnapshot) => boolean, run: () => void | Promise<void>) {
    const prior = intent, state = reading.getSnapshot();
    if (!current(prior) || !allowed(state)) return Promise.resolve();
    intent++; return Promise.resolve(run());
  }
  return Object.freeze({
    session: Object.freeze({ getSnapshot: session.getSnapshot, subscribe: session.subscribe }),
    navigation: Object.freeze({ getSnapshot: navigation.getSnapshot, subscribe: navigation.subscribe }),
    reading: Object.freeze({ getSnapshot: reading.getSnapshot, subscribe: reading.subscribe }),
    setForeground(value: boolean) {
      if (disposed) return Promise.resolve();
      const changed = session.getSnapshot().foreground !== value;
      if (!changed || disposed) return Promise.resolve();
      const operation = ++intent;
      const work = session.setForeground(value);
      return value ? afterVerification(work, operation) : work;
    },
    signIn(input: Parameters<typeof session.signIn>[0]) {
      if (disposed || session.getSnapshot().phase !== "signed-out") return Promise.resolve();
      const operation = ++intent;
      return afterVerification(navigation.signIn(input), operation);
    },
    retryVerification() {
      if (disposed || session.getSnapshot().phase !== "unavailable") return Promise.resolve();
      const operation = ++intent;
      return afterVerification(session.retryVerification(), operation);
    },
    signOut() { intent++; return session.signOut(); },
    cancelSignIn() {
      const operation = ++intent;
      navigation.cancelReturn();
      return current(operation) ? session.signOut() : Promise.resolve();
    },
    recordForegroundActivity: session.recordForegroundActivity,
    async open(destination: AppDestination) {
      const prior = intent;
      const result = navigation.open(destination);
      if (current(prior) && (result === "opened" || result === "sign-in-required")) {
        const operation = ++intent;
        if (result === "opened") await loadCurrent(navigation.getSnapshot().generation, operation);
      }
      return result;
    },
    startFeed(mode: Parameters<typeof reading.startFeed>[0]) { return atHome(() => reading.startFeed(mode)); },
    backToFeed() { return atHome(reading.backToFeed); },
    refresh() { return atHome(reading.refresh); },
    nextPage() { return readCommand(state => state.kind === "feed" && !!state.feed.page.nextCursor, reading.nextPage); },
    retry() { return readCommand(state => state.kind === "error", reading.retry); },
    reveal() { return readCommand(state => state.kind === "post" && !state.revealed, reading.reveal); },
    dispose() {
      if (disposed) return;
      disposed = true; intent++; unsubscribe(); navigation.dispose(); reading.dispose(); session.dispose();
    }
  });
}
