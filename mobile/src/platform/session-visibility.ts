import { observeNativePrivacy, type NativePrivacyPresentation, type NativePrivacySource } from "./native-privacy.ts";

export type SessionVisibilitySource = {
  /** iOS uses the native cover's epochs exclusively, never competing AppState events. */
  nativePrivacy?: {
    source: NativePrivacySource | null;
    generation(): number;
    publish(presentation: NativePrivacyPresentation | null): void;
  };
  currentState(): string | null;
  onState(listener: (state: string | null) => void): () => void;
  /** Android requires a window focus source; absence is not proof of focus. */
  requiresFocus: boolean;
  onFocus?: (listener: (focused: boolean) => void) => () => void;
  /** Optional authoritative native snapshot, queried on each active entry. */
  currentFocus?: () => Promise<unknown>;
};

/** Lifecycle observation only. The session authority owns restoration and
 * concealment. No asynchronous activation can delay a later concealment. */
export function observeSessionVisibility(source: SessionVisibilitySource,
  update: (foreground: boolean) => void | Promise<unknown>) {
  if (source.nativePrivacy) {
    const privacy = source.nativePrivacy;
    return observeNativePrivacy(privacy.source, value => {
      const completion = Promise.resolve(update(value));
      return { generation: privacy.generation(), completion };
    }, privacy.publish);
  }
  let disposed = false, revision = 0, focusRevision = 0, active = false, focused = !source.requiresFocus;
  let last: boolean | undefined;
  const stops: (() => void)[] = [];
  function concealAfterFailure(request: number) {
    if (disposed || request !== revision) return;
    active = false; focused = !source.requiresFocus; last = false; revision++; focusRevision++;
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
  function refreshFocus() {
    if (!source.requiresFocus || !source.currentFocus) return;
    const request = ++focusRevision;
    const apply = (value: unknown) => {
      if (disposed || !active || request !== focusRevision) return;
      focused = value === true;
      publish();
    };
    try { void Promise.resolve(source.currentFocus()).then(apply, () => apply(false)); }
    catch { apply(false); }
  }
  function setActive(value: string | null) {
    if (disposed) return;
    const next = value === "active", entered = next && !active;
    if (!next) { focusRevision++; focused = !source.requiresFocus; }
    active = next;
    publish();
    // Duplicate active events cannot erase a known notification-shade blur.
    if (entered) refreshFocus();
  }
  function stop() {
    if (disposed) return;
    disposed = true; revision++; focusRevision++; active = false; focused = false;
    // Detach, do not dispose the process-owned runtime. This also survives
    // React StrictMode effect teardown followed by setup with the same runtime.
    try { void Promise.resolve(update(false)).catch(() => {}); } catch { /* Continue removing other subscriptions. */ }
    for (const remove of stops.splice(0)) { try { remove(); } catch { /* Remove the remaining subscriptions too. */ } }
  }
  deliver(false);
  try {
    if (source.requiresFocus) {
      if (!source.onFocus) { stop(); return stop; }
      stops.push(source.onFocus(value => {
        if (disposed) return;
        focusRevision++;
        if (value === true && source.currentFocus) {
          // A queued positive event is only a prompt to read the current window.
          if (active) refreshFocus();
        } else {
          focused = value === true;
          publish();
        }
      }));
    }
    stops.push(source.onState(setActive));
    setActive(source.currentState());
  } catch { stop(); }
  return stop;
}
