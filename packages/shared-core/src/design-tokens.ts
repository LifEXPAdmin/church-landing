/** Existing platform presentation values. Ratios use the platform's body unit;
 * durations use milliseconds. Fonts, viewport rules and accessibility scaling
 * belong to each platform adapter, not to account or API state. */
export type DesignAppearance = "light" | "dark";
export type DesignReaderSize = "standard" | "comfortable" | "large" | "largest";
export type DesignColor =
  | "canvas" | "surface" | "subtle" | "text" | "muted" | "action"
  | "on-action" | "hover" | "accent" | "border" | "divider" | "focus"
  | "selected" | "error" | "error-surface" | "success" | "success-surface";

export interface SemanticDesignTokens {
  readonly color: Readonly<Record<DesignAppearance, Readonly<Record<DesignColor, string>>>>;
  readonly type: {
    readonly body: number;
    readonly small: number;
    readonly title: number;
    readonly titleMaximum: number;
    readonly heading: number;
    readonly subheading: number;
    readonly bodyLeading: number;
    readonly titleLeading: number;
    readonly headingLeading: number;
    readonly subheadingLeading: number;
    readonly controlLeading: number;
    readonly headingWeight: "400" | "500" | "600" | "700";
    readonly controlWeight: "400" | "500" | "600" | "700";
    readonly reader: Readonly<Record<DesignReaderSize, number>>;
  };
  readonly space: { readonly inline: number; readonly controlBlock: number; readonly content: number; readonly stack: number };
  readonly radius: { readonly control: number; readonly card: number; readonly panel: number };
  readonly motion: { readonly feedback: number; readonly page: number };
}

// Separate export keeps a timing-only browser consumer from importing palettes.
export const semanticMotionTokens = { feedback: 180, page: 500 } as const;

export const semanticDesignTokens: SemanticDesignTokens = {
  color: {
    light: {
      canvas: "#f7f4ed", surface: "#fffdfa", subtle: "#ebefe7", text: "#202923",
      muted: "#59645d", action: "#385842", "on-action": "#fffdfa", hover: "#2b4634",
      accent: "#79551f", border: "#82877d", divider: "#d8dccf", focus: "#385842",
      selected: "#e8ede4", error: "#a22e32", "error-surface": "#fbe9e7",
      success: "#2b5c3b", "success-surface": "#e5f0e3"
    },
    dark: {
      canvas: "#151d19", surface: "#1f2b24", subtle: "#29382f", text: "#f4f1e8",
      muted: "#b7c1b7", action: "#aec9ae", "on-action": "#151d19", hover: "#c3d8c1",
      accent: "#d9b96f", border: "#7d8f7e", divider: "#3d4c42", focus: "#d9b96f",
      selected: "#34473a", error: "#ffb4ab", "error-surface": "#4a2525",
      success: "#b0d4af", "success-surface": "#233d2a"
    }
  },
  type: {
    body: 1, small: 0.875, title: 1.875, titleMaximum: 2.5,
    heading: 1.75, subheading: 1.375,
    bodyLeading: 1.6, titleLeading: 1.15, headingLeading: 1.2,
    subheadingLeading: 1.3, controlLeading: 1.4,
    headingWeight: "600", controlWeight: "600",
    reader: { standard: 1, comfortable: 1.125, large: 1.25, largest: 1.5 }
  },
  space: { inline: 0.5, controlBlock: 0.625, content: 1, stack: 1.5 },
  radius: { control: 0.5, card: 0.75, panel: 1 },
  motion: semanticMotionTokens
};
