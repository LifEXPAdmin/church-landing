"use client";

import { createContext, useContext, useState, useLayoutEffect } from "react";
import {
  defaultReadingPreferences,
  preferenceCookie,
  parseReadingPreferences,
  type ReadingPreferences
} from "@/lib/platform/reading-preferences";

const ReadingContext = createContext<{
  preferences: ReadingPreferences;
  update: (change: Partial<ReadingPreferences>) => void;
  saved: boolean;
}>({ preferences: defaultReadingPreferences, update: () => {}, saved: false });

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
  useLayoutEffect(() => {
    // Reconcile browser Back/prefetched documents before paint without an account read.
    const entry = document.cookie
      .split("; ")
      .find((value) => value.startsWith(`${preferenceCookie}=`));
    setPreferences(
      parseReadingPreferences(entry?.slice(preferenceCookie.length + 1))
    );
  }, [initial]);
  function update(change: Partial<ReadingPreferences>) {
    const next = { ...preferences, ...change };
    setPreferences(next);
    try {
      document.cookie = `${preferenceCookie}=${encodeURIComponent(JSON.stringify(next))}; Path=/platform; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      setSaved(
        document.cookie
          .split("; ")
          .some(
            (entry) =>
              entry ===
              `${preferenceCookie}=${encodeURIComponent(JSON.stringify(next))}`
          )
      );
    } catch {
      setSaved(false);
    }
  }
  return (
    <ReadingContext.Provider value={{ preferences, update, saved }}>
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

export function ReadingSettings() {
  const { preferences, update, saved } = useReadingPreferences();
  return (
    <section className="gc-settings" aria-labelledby="reading-heading">
      <p className="gc-eyebrow">Make room to read</p>
      <h2 id="reading-heading">Appearance and reading</h2>
      <p className="text-gc-muted">
        Choose what feels comfortable. These choices are saved in this browser,
        not to your account or other devices.
      </p>
      <div className="gc-setting-row">
        <label htmlFor="appearance">Appearance</label>
        <select
          id="appearance"
          value={preferences.appearance}
          onChange={(e) =>
            update({
              appearance: e.target.value as ReadingPreferences["appearance"]
            })
          }
        >
          <option value="system">Use device setting</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
      <div className="gc-setting-row">
        <label htmlFor="reader-size">Post text size</label>
        <select
          id="reader-size"
          value={preferences.size}
          onChange={(e) =>
            update({ size: e.target.value as ReadingPreferences["size"] })
          }
        >
          <option value="standard">Standard</option>
          <option value="comfortable">Comfortable</option>
          <option value="large">Large</option>
          <option value="largest">Largest</option>
        </select>
      </div>
      <div className="gc-setting-row">
        <label htmlFor="feed-mode">Preferred home feed</label>
        <select
          id="feed-mode"
          value={preferences.mode}
          onChange={(e) =>
            update({ mode: e.target.value as ReadingPreferences["mode"] })
          }
        >
          <option value="list">List: scroll through posts</option>
          <option value="pages">Pages: one post at a time</option>
        </select>
      </div>
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
          checked={preferences.reduceMotion}
          onChange={(e) => update({ reduceMotion: e.target.checked })}
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
          checked={preferences.reduceData}
          onChange={(e) => update({ reduceData: e.target.checked })}
        />
      </label>
      <p className="gc-reader-sample">
        A little space to listen. A place to belong.
      </p>
      <p role="status" className="text-sm text-gc-muted">
        {saved
          ? "Reading preferences saved in this browser."
          : "Changes apply immediately. Browser storage must be enabled to remember them."}
      </p>
    </section>
  );
}
