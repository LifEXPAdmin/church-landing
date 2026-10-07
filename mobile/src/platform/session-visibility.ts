export type SessionVisibilitySource = {
  currentState(): string | null;
  onState(listener: (state: string | null) => void): () => void;
  /** Android requires a window focus source; absence is not proof of focus. */
  requiresFocus: boolean;
  onFocus?: (listener: (focused: boolean) => void) => () => void;
};

/** Lifecycle observation only. The session authority owns restoration and
 * concealment. No asynchronous activation can delay a later concealment. */
export function observeSessionVisibility(source: SessionVisibilitySource,
  update: (foreground: boolean) => void | Promise<unknown>) {
  let disposed = false, revision = 0, active = false, focused = !source.requiresFocus;
  let last: boolean | undefined;
  const stops: (() => void)[] = [];
  function concealAfterFailure(request: number) {
    if (disposed || request !== revision) return;
    active = false; focused = !source.requiresFocus; last = false; revision++;
    try { void Promise.resolve(update(false)).catch(() => {}); } catch { /* Best effort terminal concealment. */ }
  }
  function deliver(value: boolean) {
    if (last === value) return;
    last = value;
    const request = ++revision;
    try { void Promise.resolve(update(value)).catch(() => concealAfterFailure(request)); }
    catch { concealAfterFailure(request); }
  }
  const publish = () => { if (!disposed) deliver(active && focused); };
  function stop() {
    if (disposed) return;
    disposed = true; revision++; active = false; focused = false;
    // Detach, do not dispose the process-owned runtime. This also survives
    // React StrictMode effect teardown followed by setup with the same runtime.
    try { void Promise.resolve(update(false)).catch(() => {}); } catch { /* Continue removing other subscriptions. */ }
    for (const remove of stops.splice(0)) { try { remove(); } catch { /* Remove the remaining subscriptions too. */ } }
  }
  deliver(false);
  try {
    if (source.requiresFocus) {
      if (!source.onFocus) { stop(); return stop; }
      stops.push(source.onFocus(value => { if (!disposed) { focused = value === true; publish(); } }));
    }
    stops.push(source.onState(value => {
      if (disposed) return;
      active = value === "active";
      if (!active) focused = !source.requiresFocus;
      publish();
    }));
    active = source.currentState() === "active";
    publish();
  } catch { stop(); }
  return stop;
}
