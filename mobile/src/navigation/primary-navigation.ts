import type { ScreenId } from "@godschurches/shared-core";

export type NativeTabId = "home" | "churches" | "explore" | "messages" | "menu";
export type NativeTabPlacement = Readonly<{ id: NativeTabId; label?: string }>;
export type NativeTab = Readonly<{ id: NativeTabId; label: string; destination: Readonly<{ kind: "screen"; screen: ScreenId }> }>;

const ids: readonly NativeTabId[] = Object.freeze(["home", "churches", "explore", "messages", "menu"]);
export const defaultNativeTabs: readonly NativeTabPlacement[] = Object.freeze(ids.map((id) => Object.freeze({ id })));
const labels: Readonly<Record<NativeTabId, string>> = Object.freeze({ home: "Home", churches: "Churches", explore: "Explore", messages: "Messages", menu: "Menu" });

/** Presentation projection, not an authentication or permission decision.
 * M13 must supply member=true only from its verified current session. */
export function nativePrimaryNavigation(member: boolean, layout: readonly NativeTabPlacement[] = defaultNativeTabs): readonly NativeTab[] {
  if (layout.length !== ids.length || new Set(layout.map((item) => item.id)).size !== ids.length ||
      layout.some((item) => !ids.includes(item.id) || (item.label !== undefined && (!item.label.trim() || item.label.length > 80))))
    throw new Error("Native tab layout must contain each primary destination once with bounded labels.");
  return Object.freeze(layout.map(({ id, label }) => Object.freeze({
    id,
    label: label?.trim() ?? (id === "churches" && member ? "My church" : labels[id]),
    destination: Object.freeze({ kind: "screen" as const, screen: id === "churches" && member ? "myChurch" : id })
  })));
}
