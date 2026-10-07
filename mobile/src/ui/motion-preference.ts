export interface MotionPreferenceSource {
  read(): Promise<boolean>;
  subscribe(listener: (reduced: boolean) => void): () => void;
  onResume(listener: () => void): () => void;
}

/** Unknown accessibility state reduces motion. A stale async query must never
 * undo a newer device event, resume query or unmount. */
export function observeMotionPreference(source: MotionPreferenceSource, update: (reduced: boolean) => void) {
  let active = true, revision = 0;
  update(true);
  const read = () => {
    const request = ++revision;
    void source.read().then((reduced) => {
      if (active && revision === request) update(reduced);
    }).catch(() => {
      if (active && revision === request) update(true);
    });
  };
  const stopChanges = source.subscribe((reduced) => {
    if (!active) return;
    revision++;
    update(reduced);
  });
  const stopResume = source.onResume(() => { if (active) { update(true); read(); } });
  read();
  return () => {
    active = false;
    revision++;
    stopChanges();
    stopResume();
  };
}
