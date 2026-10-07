import { destinationWebPath, parseDestinationPath, type AppDestination } from "@godschurches/shared-core";
import type { createNativeSessionController } from "../session/session-controller.ts";
import { nativeNavigationSupport, type NativeNavigationAvailability } from "./availability.ts";

type Session = Pick<ReturnType<typeof createNativeSessionController>, "getSnapshot" | "subscribe" | "signIn">;
export type NavigationSnapshot = Readonly<{
  generation: number;
  owner: string | null;
  /** Address only. The renderer still needs a fresh authorized resource read. */
  destination: Readonly<AppDestination> | null;
  hasPendingReturn: boolean;
}>;
type OpenResult = "invalid" | "unavailable" | "concealed" | "sign-in-required" | "opened";

function address(value: AppDestination): Readonly<AppDestination> | null {
  try {
    const path = destinationWebPath(value);
    if (!path) return null;
    // Preserve the edit-profile presentation alias; discard all extra fields.
    const clean = value.kind === "screen" ? { kind: "screen" as const, screen: value.screen } : parseDestinationPath(path);
    return clean && Object.freeze(clean);
  } catch { return null; }
}

/** Bounded navigation state over the sole session authority. No credentials,
 * private content, retained URLs, persistence, router or automatic reads. */
export function createSessionNavigation(session: Session, availability: NativeNavigationAvailability) {
  const available = Object.freeze({ screens: Object.freeze([...availability.screens]), resources: Object.freeze([...availability.resources]) });
  const home = address({ kind: "screen", screen: "home" })!;
  const initial = nativeNavigationSupport(home, available).kind === "native" ? home : null;
  const listeners = new Set<() => void>();
  let disposed = false;
  let pending: { destination: Readonly<AppDestination>; generation: number } | null = null;
  let attempt: { generation: number } | null = null;
  let state: NavigationSnapshot = Object.freeze({ generation: -1, owner: null, destination: null, hasPendingReturn: false });

  function publish(next: NavigationSnapshot) {
    if (state.generation === next.generation && state.owner === next.owner && state.destination === next.destination &&
      state.hasPendingReturn === next.hasPendingReturn) return;
    state = Object.freeze(next);
    for (const listener of listeners) { try { listener(); } catch { /* A renderer cannot block concealment. */ } }
  }
  function sync() {
    if (disposed) return;
    const current = session.getSnapshot(); // Also enforces an overdue server deadline.
    if (disposed) return; // Expiry callbacks may dispose this navigation owner.
    const ready = current.foreground && current.phase === "ready" && current.account !== null;
    const expected = attempt !== null && current.generation === attempt.generation;
    if (ready) {
      const same = state.owner === current.account!.id && state.generation === current.generation;
      const destination = same ? state.destination : expected && pending ? pending.destination : initial;
      pending = null; attempt = null;
      publish({ generation: current.generation, owner: current.account!.id, destination, hasPendingReturn: false });
      return;
    }
    const guest = current.foreground && current.phase === "signed-out" && pending?.generation === current.generation;
    const signingIn = current.foreground && current.phase === "signing-in" && expected;
    if (!guest && !signingIn) { pending = null; attempt = null; }
    publish({ generation: current.generation, owner: null, destination: null, hasPendingReturn: pending !== null });
  }
  const unsubscribe = session.subscribe(sync);
  sync();

  return {
    getSnapshot(): NavigationSnapshot { sync(); return state; },
    subscribe(listener: () => void) {
      if (!disposed) listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    open(value: AppDestination): OpenResult {
      if (disposed) return "concealed";
      sync();
      if (disposed) return "concealed";
      const destination = address(value);
      if (!destination) return "invalid";
      if (nativeNavigationSupport(destination, available).kind !== "native") return "unavailable";
      const current = session.getSnapshot();
      if (disposed || !current.foreground) return "concealed";
      if (current.phase === "signed-out") {
        pending = { destination, generation: current.generation };
        attempt = null;
        sync();
        return "sign-in-required";
      }
      if (current.phase !== "ready" || !current.account) return "concealed";
      publish({ generation: current.generation, owner: current.account.id, destination, hasPendingReturn: false });
      return "opened";
    },
    /** Only this explicit sign-in command may adopt the guest's return address.
     * A login started elsewhere never inherits it. The session owns issuance. */
    signIn(input: Parameters<Session["signIn"]>[0]): Promise<void> {
      if (disposed) return Promise.resolve();
      sync();
      if (disposed) return Promise.resolve();
      const current = session.getSnapshot();
      if (disposed || !current.foreground || current.phase !== "signed-out") return Promise.resolve();
      // The canonical session advances exactly once before publishing signing-in.
      const started = { generation: current.generation + 1 };
      attempt = started;
      return session.signIn(input).finally(() => {
        if (attempt === started) { attempt = null; pending = null; }
        sync();
      });
    },
    /** Clears only the return address; cancelling authentication uses the sole
     * session controller's signOut so issued credentials get proper cleanup. */
    cancelReturn() { pending = null; attempt = null; sync(); },
    dispose() {
      if (disposed) return;
      disposed = true; unsubscribe(); pending = null; attempt = null;
      publish({ generation: state.generation, owner: null, destination: null, hasPendingReturn: false });
      listeners.clear();
    }
  };
}
