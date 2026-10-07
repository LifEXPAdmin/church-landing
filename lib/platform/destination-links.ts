import {
  destinationWebPath,
  parseDestinationPath,
  resourceDestination,
  type AppDestination
} from "../../packages/shared-core/src/destinations";
import { postId } from "./post-input";
import { PortalError } from "./portal-policy";

export type { ShareKind } from "../../packages/shared-core/src/destinations";

/** Existing share address validation. Public-share eligibility stays in publicSharePreview. */
export function canonicalSharePath(
  kind: unknown,
  id: unknown,
  commentId?: unknown
): string {
  if (
    !["post", "comment", "church", "event", "profile", "topic"].includes(
      String(kind)
    )
  )
    throw new PortalError(400, "Choose a supported sharing destination.");
  const safeId = postId(id);
  if (
    kind === "topic" &&
    (safeId.length < 3 ||
      safeId.length > 60 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(safeId))
  )
    throw new PortalError(400, "Choose a valid topic address.");
  // Preserve the original wrapper's accepted identifier normalization and errors.
  const destination = resourceDestination(
    kind === "post" ||
      kind === "comment" ||
      kind === "church" ||
      kind === "event" ||
      kind === "topic"
      ? kind
      : "profile",
    safeId,
    kind === "comment" ? postId(commentId) : undefined
  );
  const path = destination && destinationWebPath(destination);
  if (!path)
    throw new PortalError(400, "Choose a supported sharing destination.");
  return path;
}

function trustedHttpsOrigin(value: string): string | null {
  try {
    const origin = new URL(value);
    return origin.protocol === "https:" &&
      !origin.username &&
      !origin.password &&
      origin.origin === value
      ? value
      : null;
  } catch {
    return null;
  }
}

/** The origin is trusted application configuration, never request Host or input parameters. */
export function parseDestinationLink(
  value: unknown,
  trustedOrigin: string
): AppDestination | null {
  if (!trustedHttpsOrigin(trustedOrigin) || typeof value !== "string")
    return null;
  if (value.startsWith("/")) return parseDestinationPath(value);
  if (value.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.origin !== trustedOrigin ||
      url.username ||
      url.password
    )
      return null;
    // Do not pass URL.pathname: URL parsing removes traversal before we can reject it.
    const raw = /^https:\/\/[^/?#]+(\/.*)$/.exec(value);
    return raw ? parseDestinationPath(raw[1]) : null;
  } catch {
    return null;
  }
}

/** An HTTPS address is not a public-share projection. Check current server eligibility before sharing. */
export function destinationHttpsUrl(
  destination: AppDestination,
  trustedOrigin: string
): string | null {
  const origin = trustedHttpsOrigin(trustedOrigin);
  const path = destinationWebPath(destination);
  return origin && path ? origin + path : null;
}
