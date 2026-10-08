export type NativePrivacySource = {
  readState(): Promise<unknown>;
  onStateChange(listener: () => void): () => void;
};
export type NativePrivacyPresentation = Readonly<{
  epoch: number;
  sessionGeneration: number;
  presentationId: string;
}>;
type Update = (foreground: boolean) => { generation: number; completion?: Promise<unknown> };
let ownerSequence = 0;

/** Native state is the sole protected visibility input. Events are prompts to read,
 * never permission to reveal. The existing session owner still verifies access. */
export function observeNativePrivacy(source: NativePrivacySource | null, update: Update,
  publish: (presentation: NativePrivacyPresentation | null) => void) {
  const owner = ++ownerSequence;
  let disposed = false, revision = 0, highWater = 0;
  let remove: (() => void) | undefined;
  function conceal(request?: number) {
    publish(null);
    try {
      void Promise.resolve(update(false).completion).catch(() => { if (request !== undefined) fail(request); });
      return true;
    } catch { return false; }
  }
  function fail(request: number) {
    if (disposed || request !== revision) return;
    revision++;
    conceal();
  }
  function refresh() {
    if (disposed) return;
    const request = ++revision;
    if (!conceal(request)) { fail(request); return; }
    const apply = (value: unknown) => {
      if (disposed || request !== revision) return;
      if (!value || typeof value !== "object" || !("epoch" in value) || !("active" in value) ||
        !Number.isSafeInteger(value.epoch) || typeof value.epoch !== "number" || value.epoch <= 0 ||
        typeof value.active !== "boolean" || value.epoch < highWater) { fail(request); return; }
      highWater = value.epoch;
      if (!value.active) return;
      try {
        // setForeground(true) synchronously invalidates the old account and
        // publishes verifying before its first await. Capture only afterward.
        const result = update(true);
        if (!Number.isSafeInteger(result.generation) || result.generation < 0 || !Number.isSafeInteger(owner)) {
          fail(request); return;
        }
        void Promise.resolve(result.completion).catch(() => fail(request));
        if (!disposed && request === revision) publish(Object.freeze({ epoch: value.epoch,
          sessionGeneration: result.generation, presentationId: owner + ":" + request }));
      } catch { fail(request); }
    };
    try { void Promise.resolve(source!.readState()).then(apply, () => fail(request)); }
    catch { fail(request); }
  }
  function stop() {
    if (disposed) return;
    disposed = true; revision++;
    conceal();
    try { remove?.(); } catch { /* Late native callbacks remain fenced. */ }
  }
  if (!conceal()) return stop;
  if (!source) return stop;
  try { remove = source.onStateChange(refresh); refresh(); }
  catch { stop(); }
  return stop;
}

/** Later sign-in/sign-out generations are canonical too. An earlier render
 * must never carry the new native activation's presentation proof. */
export function presentationMatches(presentation: NativePrivacyPresentation | null,
  state: { generation: number; foreground: boolean; phase: string }) {
  return presentation !== null && state.foreground && state.phase !== "concealed" &&
    Number.isSafeInteger(state.generation) && state.generation >= presentation.sessionGeneration;
}
