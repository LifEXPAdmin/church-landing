// Shared installation contract. Importable by the future manifest and help UI.
export const INSTALL_POLICY = {
  id: "/",
  name: "Godschurches",
  short_name: "Godschurches",
  start_url: "/platform",
  scope: "/",
  display: "standalone",
  background_color: "#f7f4ed",
  theme_color: "#f7f4ed",
  icons: [
    {
      src: "/brand/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any"
    },
    {
      src: "/brand/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any"
    },
    {
      src: "/brand/maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable"
    }
  ]
} as const;

export type UpdateDecision =
  | "unknown"
  | "current"
  | "keep-work"
  | "offer-refresh";
// An update notification is never permission to reload or discard an in-flight edit.
export function installationUpdateDecision(
  loaded: string | null,
  available: string | null,
  work: { dirty: boolean; saving: boolean; conflict: boolean }
): UpdateDecision {
  if (!loaded || !available) return "unknown";
  if (loaded === available) return "current";
  return work.dirty || work.saving || work.conflict
    ? "keep-work"
    : "offer-refresh";
}
export function publicReleaseId(value: unknown): string | null {
  return typeof value === "string" && /^[a-f0-9]{40}$/i.test(value)
    ? value.toLowerCase()
    : null;
}
