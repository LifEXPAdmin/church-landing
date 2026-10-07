import { parseDestinationPath, type AppDestination } from "@godschurches/shared-core";

/** Native link intake only. The origin comes from reviewed app configuration,
 * never from the link itself, a server response or request Host. OS association,
 * OAuth callbacks, session verification and navigation activation are separate. */
export function createNativeLinkReader(trustedOrigin: string) {
  const origin = new URL(trustedOrigin);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.origin !== trustedOrigin)
    throw new Error("Native links require one exact HTTPS origin.");

  return (value: unknown): AppDestination | null => {
    if (typeof value !== "string" || value.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
    try {
      const link = new URL(value);
      if (link.protocol !== "https:" || link.origin !== trustedOrigin || link.username || link.password) return null;
      // URL.pathname normalizes dot segments before the canonical parser can
      // reject them. Forward the original path, query and fragment instead.
      const raw = /^https:\/\/[^/?#]+(\/.*)$/.exec(value);
      return raw ? parseDestinationPath(raw[1]) : null;
    } catch {
      return null;
    }
  };
}
