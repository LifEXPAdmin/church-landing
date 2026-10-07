import { destinationWebPath, type AppDestination, type ScreenId } from "@godschurches/shared-core";

export interface NativeNavigationAvailability {
  readonly screens: readonly ScreenId[];
  readonly resources: readonly Exclude<AppDestination["kind"], "screen">[];
}
const none: NativeNavigationAvailability = Object.freeze({ screens: Object.freeze([]), resources: Object.freeze([]) });

/** Bundled renderer availability only. A native result never authorizes a read.
 * The actual session/feature adapter must recheck current server access before
 * rendering private data. An unavailable result is an explicit UI choice, not
 * permission to open a browser or WebView automatically. */
export function nativeNavigationSupport(destination: AppDestination, available: NativeNavigationAvailability = none):
  | { kind: "invalid" }
  | { kind: "unavailable"; websitePath: string }
  | { kind: "native"; requiresCurrentAccess: true } {
  const websitePath = destinationWebPath(destination);
  if (!websitePath) return { kind: "invalid" };
  const implemented = destination.kind === "screen"
    ? available.screens.includes(destination.screen)
    : available.resources.includes(destination.kind);
  return implemented ? { kind: "native", requiresCurrentAccess: true } : { kind: "unavailable", websitePath };
}
