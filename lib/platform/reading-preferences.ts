export const preferenceCookie = "godschurches_reading";
export type ReadingPreferences = {
  appearance: "system" | "light" | "dark";
  mode: "list" | "pages";
  size: "standard" | "comfortable" | "large" | "largest";
  reduceMotion: boolean;
};
export const defaultReadingPreferences: ReadingPreferences = {
  appearance: "system",
  mode: "list",
  size: "comfortable",
  reduceMotion: false
};

// This cookie contains presentation choices only, never account identifiers.
export function parseReadingPreferences(raw?: string): ReadingPreferences {
  try {
    const value = JSON.parse(decodeURIComponent(raw ?? ""));
    return {
      appearance: ["system", "light", "dark"].includes(value?.appearance)
        ? value.appearance
        : "system",
      mode: value?.mode === "pages" ? "pages" : "list",
      size: ["standard", "comfortable", "large", "largest"].includes(
        value?.size
      )
        ? value.size
        : "comfortable",
      reduceMotion: value?.reduceMotion === true
    };
  } catch {
    return { ...defaultReadingPreferences };
  }
}
