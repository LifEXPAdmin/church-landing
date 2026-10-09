import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AccessibilityInfo, AppState, useColorScheme, useWindowDimensions } from "react-native";
import { nativeDesignTokens, type NativeDesignPreferences } from "@godschurches/shared-core";
import { observeMotionPreference } from "./motion-preference";

type LocalChoices = Pick<NativeDesignPreferences, "appearance" | "readerSize" | "reduceMotion">;
export type NativeTheme = ReturnType<typeof nativeDesignTokens>;
const initial: LocalChoices = { appearance: "system", readerSize: "comfortable", reduceMotion: false };
const ThemeContext = createContext<{
  theme: NativeTheme;
  /** Text layout identity only. Native Text still performs font scaling. */
  fontScale: number;
  choices: LocalChoices;
  update: (change: Partial<LocalChoices>) => void;
} | null>(null);

/** Preview choices are ephemeral installation UI state, never account settings. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const deviceAppearance = useColorScheme();
  const { fontScale } = useWindowDimensions();
  const systemAppearance = deviceAppearance === "dark" || deviceAppearance === "light" ? deviceAppearance : null;
  const [choices, setChoices] = useState(initial);
  const [systemReduceMotion, setSystemReduceMotion] = useState(true);
  useEffect(() => observeMotionPreference({
    read: () => AccessibilityInfo.isReduceMotionEnabled(),
    subscribe: (listener) => {
      const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", listener);
      return () => subscription.remove();
    },
    onResume: (listener) => {
      const subscription = AppState.addEventListener("change", (state) => { if (state === "active") listener(); });
      return () => subscription.remove();
    }
  }, setSystemReduceMotion), []);
  const theme = useMemo(() => nativeDesignTokens({ ...choices, systemAppearance, systemReduceMotion }), [choices, systemAppearance, systemReduceMotion]);
  const value = useMemo(() => ({ theme, choices, fontScale,
    update: (change: Partial<LocalChoices>) => setChoices((current) => ({ ...current, ...change }))
  }), [theme, choices, fontScale]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("Native UI requires ThemeProvider");
  return value;
}
