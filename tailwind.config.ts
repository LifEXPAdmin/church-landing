import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        gc: {
          canvas: "var(--gc-canvas)",
          surface: "var(--gc-surface)",
          subtle: "var(--gc-subtle)",
          text: "var(--gc-text)",
          muted: "var(--gc-muted)",
          action: "var(--gc-action)",
          "on-action": "var(--gc-on-action)",
          hover: "var(--gc-hover)",
          accent: "var(--gc-accent)",
          border: "var(--gc-border)",
          divider: "var(--gc-divider)",
          focus: "var(--gc-focus)",
          selected: "var(--gc-selected)",
          error: "var(--gc-error)",
          "error-surface": "var(--gc-error-surface)",
          success: "var(--gc-success)",
          "success-surface": "var(--gc-success-surface)"
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        border: "hsl(var(--border))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))"
      }
    }
  },
  plugins: []
};

export default config;
