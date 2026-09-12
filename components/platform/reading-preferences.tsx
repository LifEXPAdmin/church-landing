"use client";

import {
  createContext,
  useContext,
  useState,
  useLayoutEffect,
  useRef
} from "react";
import {
  defaultReadingPreferences,
  preferenceCookie,
  parseReadingPreferences,
  type ReadingPreferences
} from "@/lib/platform/reading-preferences";
import { DisplayPreview } from "./display-preview";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";

const ReadingContext = createContext<{
  preferences: ReadingPreferences;
  update: (change: Partial<ReadingPreferences>) => void;
  saved: boolean;
  attempted: boolean;
  discard: () => void;
}>({
  preferences: defaultReadingPreferences,
  update: () => {},
  saved: false,
  attempted: false,
  discard: () => {}
});

export function ReadingProvider({
  initial,
  release = null,
  children
}: {
  initial: ReadingPreferences;
  release?: string | null;
  children: React.ReactNode;
}) {
  const [preferences, setPreferences] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const current = useRef(preferences);
  const confirmed = useRef(initial),
    unsaved = useRef(false);
  current.current = preferences;
  useLayoutEffect(() => {
    if (unsaved.current) return;
    // Reconcile browser Back/prefetched documents before paint without an account read.
    const entry = document.cookie
      .split("; ")
      .find((value) => value.startsWith(`${preferenceCookie}=`));
    const next = parseReadingPreferences(
      entry?.slice(preferenceCookie.length + 1)
    );
    confirmed.current = next;
    setPreferences(next);
  }, [initial]);
  function update(change: Partial<ReadingPreferences>) {
    const next = { ...current.current, ...change };
    current.current = next;
    setAttempted(true);
    setPreferences(next);
    try {
      document.cookie = `${preferenceCookie}=${encodeURIComponent(JSON.stringify(next))}; Path=/platform; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      const stored = document.cookie
        .split("; ")
        .some(
          (entry) =>
            entry ===
            `${preferenceCookie}=${encodeURIComponent(JSON.stringify(next))}`
        );
      setSaved(stored);
      unsaved.current = !stored;
      if (stored) confirmed.current = next;
    } catch {
      setSaved(false);
      unsaved.current = true;
    }
  }
  function discard() {
    current.current = confirmed.current;
    setPreferences(confirmed.current);
    setAttempted(false);
    setSaved(false);
    unsaved.current = false;
  }
  return (
    <ReadingContext.Provider
      value={{ preferences, update, saved, attempted, discard }}
    >
      <div
        className="platform-design"
        data-release={release ?? undefined}
        data-appearance={preferences.appearance}
        data-reader-size={preferences.size}
        data-reduce-motion={preferences.reduceMotion}
      >
        {children}
      </div>
    </ReadingContext.Provider>
  );
}

export const useReadingPreferences = () => useContext(ReadingContext);

export function AppearanceSelect() {
  const { preferences, update } = useReadingPreferences();
  return (
    <label className="gc-appearance-select" htmlFor="quick-appearance">
      Appearance
      <select
        id="quick-appearance"
        value={preferences.appearance}
        onChange={(event) =>
          update({
            appearance: event.target.value as ReadingPreferences["appearance"]
          })
        }
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}

export function ReadingSettings({
  allowReset = false
}: {
  allowReset?: boolean;
}) {
  const { preferences, update, saved, attempted, discard } =
    useReadingPreferences();
  const [draft, setDraft] = useState<ReadingPreferences | null>(null);
  const choices = draft ?? preferences;
  const previewChanged =
    draft !== null &&
    Object.keys(preferences).some(
      (key) =>
        choices[key as keyof ReadingPreferences] !==
        preferences[key as keyof ReadingPreferences]
    );
  const saveFailed = attempted && !saved;
  const dirty = previewChanged || saveFailed;
  function preview(change: Partial<ReadingPreferences>) {
    setDraft((previous) => ({ ...(previous ?? preferences), ...change }));
    setNotice("");
  }
  function discardChoices() {
    setDraft(null);
    if (saveFailed) discard();
    setNotice("");
  }
  const [resetPreview, setResetPreview] = useState(false);
  const [notice, setNotice] = useState("");
  useUnsavedSocialWork(
    { dirty, saving: false, conflict: false },
    () =>
      setNotice(
        "Retry saving or discard your unsaved reading choices before leaving."
      ),
    true
  );
  return (
    <section className="gc-settings" aria-labelledby="reading-heading">
      <p className="gc-eyebrow">Make room to read</p>
      <h2 id="reading-heading">Appearance and reading</h2>
      <p className="text-gc-muted">
        Preview what feels comfortable, then save your choices in this browser.
        These preferences do not sync to your account or other devices.
      </p>
      <fieldset disabled={saveFailed} className="space-y-3">
        <legend className="sr-only">Display choices</legend>
        <div className="gc-setting-row">
          <label htmlFor="appearance">Appearance</label>
          <select
            id="appearance"
            value={choices.appearance}
            onChange={(e) =>
              preview({
                appearance: e.target.value as ReadingPreferences["appearance"]
              })
            }
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="gc-setting-row">
          <label htmlFor="reader-size">Post text size</label>
          <select
            id="reader-size"
            value={choices.size}
            onChange={(e) =>
              preview({ size: e.target.value as ReadingPreferences["size"] })
            }
          >
            <option value="standard">Standard</option>
            <option value="comfortable">Comfortable</option>
            <option value="large">Large</option>
            <option value="largest">Largest</option>
          </select>
        </div>
        <div className="gc-setting-row">
          <label htmlFor="feed-mode">Home reading layout</label>
          <select
            id="feed-mode"
            value={choices.mode}
            onChange={(e) =>
              preview({ mode: e.target.value as ReadingPreferences["mode"] })
            }
          >
            <option value="list">List</option>
            <option value="pages">Pages</option>
          </select>
        </div>
        <p className="text-sm text-gc-muted">
          List scrolls through posts; Pages shows one post at a time. Your feed
          sources stay the same. System appearance follows your device’s light
          or dark theme. Comfortable spacing and keyboard access are always
          included.
        </p>
        <label className="gc-setting-row" htmlFor="reduce-motion">
          <span>
            Reduce motion
            <br />
            <span className="text-sm font-normal text-gc-muted">
              Your device&apos;s reduced-motion setting is always respected.
            </span>
          </span>
          <input
            id="reduce-motion"
            type="checkbox"
            checked={choices.reduceMotion}
            onChange={(e) => preview({ reduceMotion: e.target.checked })}
          />
        </label>
        <label className="gc-setting-row" htmlFor="reduce-data">
          <span>
            Reduce photo data
            <br />
            <span className="text-sm font-normal text-gc-muted">
              Load smaller previews. Post galleries show one photo at a time;
              large images load only when you open them.
            </span>
          </span>
          <input
            id="reduce-data"
            type="checkbox"
            checked={choices.reduceData}
            onChange={(e) => preview({ reduceData: e.target.checked })}
          />
        </label>
      </fieldset>
      <DisplayPreview preferences={choices} />
      <p role="status" className="text-sm text-gc-muted">
        {previewChanged
          ? "Preview only. Save display choices to apply them across this browser."
          : saved
            ? "Reading preferences saved in this browser."
            : attempted
              ? "Your choices are applied, but could not be saved in this browser. Enable browser storage and retry."
              : "Try the preview, then save. Browser storage must be enabled to remember your choices."}
      </p>
      {notice && dirty && <p role="status">{notice}</p>}
      <div className="flex flex-wrap gap-3">
        {saveFailed ? (
          <button
            type="button"
            className="gc-button"
            onClick={() => update(preferences)}
          >
            Retry saving reading preferences
          </button>
        ) : (
          <button
            type="button"
            className="gc-button"
            disabled={!previewChanged}
            onClick={() => {
              update(choices);
              setDraft(null);
              setNotice("");
            }}
          >
            Save display choices
          </button>
        )}
        {dirty && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={discardChoices}
          >
            Discard unsaved reading choices
          </button>
        )}
      </div>
      {allowReset && (
        <div className="space-y-3">
          {!resetPreview ? (
            <button
              className="gc-button gc-button-quiet"
              type="button"
              onClick={() => setResetPreview(true)}
            >
              Restore display defaults
            </button>
          ) : (
            <section
              aria-label="Review display defaults"
              className="space-y-3 rounded-xl border border-gc-divider p-4"
            >
              <h3 className="text-xl">Restore defaults on this browser?</h3>
              <p>
                Use the device appearance, comfortable text, and Pages
                navigation. Turn off the extra reduced-motion and
                reduced-photo-data choices. Your device&apos;s reduced-motion
                setting still applies.
              </p>
              <p>
                Account security, contact sharing, relationship privacy and
                church settings stay as they are.
              </p>
              <button
                className="gc-button"
                type="button"
                onClick={() => {
                  setDraft(null);
                  setNotice("");
                  update({ ...defaultReadingPreferences });
                  setResetPreview(false);
                }}
              >
                Confirm display reset
              </button>{" "}
              <button
                className="gc-button gc-button-quiet"
                type="button"
                onClick={() => setResetPreview(false)}
              >
                Keep my display choices
              </button>
            </section>
          )}
        </div>
      )}
    </section>
  );
}
