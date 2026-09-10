export const PROFILE_PALETTES = [
  { value: "sage", label: "Sage", background: "#e7efe8", ink: "#21432f" },
  { value: "blue", label: "Sky", background: "#e6eef8", ink: "#203e60" },
  { value: "warm", label: "Sand", background: "#f4eadc", ink: "#613d22" }
] as const;
export const PROFILE_BACKGROUNDS = [
  { value: "plain", label: "Plain" },
  { value: "soft", label: "Soft light" },
  { value: "lines", label: "Fine lines" }
] as const;
export const PROFILE_ORDERS = [
  { value: "about-first", label: "About, then Posts" },
  { value: "posts-first", label: "Posts, then About" }
] as const;
export const defaultProfileStyle = {
  version: 0,
  palette: "sage",
  background: "plain",
  sectionOrder: "about-first",
  introduction: ""
};
export type ProfileStyle = typeof defaultProfileStyle;
export function profileInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();
}
export function validProfileStyle(input: Record<string, unknown>) {
  return (
    PROFILE_PALETTES.some((p) => p.value === input.palette) &&
    PROFILE_BACKGROUNDS.some((p) => p.value === input.background) &&
    PROFILE_ORDERS.some((p) => p.value === input.sectionOrder) &&
    typeof input.introduction === "string" &&
    input.introduction.length <= 1000
  );
}
