import type { FixturePost, FixtureReader } from "./fixture.ts";

export type JourneyState =
  | { screen: "welcome"; notice: string | null }
  | { screen: "feed"; status: "loading" | "ready" | "error"; posts: readonly FixturePost[] }
  | { screen: "post"; posts: readonly FixturePost[]; post: FixturePost; revealed: boolean };

/** A disposable fixture journey. Real auth, DTOs and requests use canonical package receipts. */
export function createFixtureJourney(read: FixtureReader) {
  let state: JourneyState = { screen: "welcome", notice: null };
  let generation = 0;
  let active: AbortController | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: JourneyState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const cancel = () => {
    generation++;
    active?.abort();
    active = null;
  };
  const load = async (fail = false) => {
    cancel();
    const requestGeneration = generation;
    const controller = new AbortController();
    active = controller;
    publish({ screen: "feed", status: "loading", posts: [] });
    try {
      if (fail) throw new Error("Fictional offline case.");
      const posts = await read(controller.signal);
      if (requestGeneration !== generation || controller.signal.aborted) return false;
      // A bounded fixture screen, not a second API parser.
      publish({ screen: "feed", status: "ready", posts: posts.slice(0, 30) });
      return true;
    } catch {
      if (requestGeneration !== generation || controller.signal.aborted) return false;
      publish({ screen: "feed", status: "error", posts: [] });
      return false;
    } finally {
      if (requestGeneration === generation) active = null;
    }
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start: () => load(),
    retry: () => { if (state.screen === "feed") return load(); },
    simulateOffline: () => { if (state.screen !== "welcome") return load(true); },
    openPost(id: string) {
      if (state.screen === "welcome") return false;
      const post = state.posts.find((entry) => entry.id === id);
      if (!post) return false;
      publish({ screen: "post", posts: state.posts, post, revealed: post.contentNote === null });
      return true;
    },
    reveal() { if (state.screen === "post") publish({ ...state, revealed: true }); },
    back() { if (state.screen === "post") publish({ screen: "feed", status: "ready", posts: state.posts }); },
    signOut() { cancel(); publish({ screen: "welcome", notice: "Demo signed out. Reading state has been cleared." }); },
    dispose() { cancel(); listeners.clear(); state = { screen: "welcome", notice: null }; }
  };
}
