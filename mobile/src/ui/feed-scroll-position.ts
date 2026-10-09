import type { ReadingSnapshot } from "../reading/read-controller";

type Feed = Extract<ReadingSnapshot, { kind: "feed" }>["feed"];
export type ScrollIdentity = Readonly<{ owner: string; generation: number } & (
  | ({ kind: "feed" } & Pick<Feed, "mode" | "scope" | "pageCursor">)
  | { kind: "post"; postId: string }
)>;
export type ScrollPosition = Readonly<{ identity: ScrollIdentity; y: number }>;

const nonnegative = (value: number) => Number.isFinite(value) && value >= 0;

/** The caller owns one feed and one current-detail bookmark. Clear on access
 * changes, errors and unmount; clear detail on navigation and feed on choices,
 * Next or Refresh. Current read/mount checks must fence callbacks; loading
 * cannot record. This policy neither establishes access nor measures layout. */
export function captureScrollPosition(identity: ScrollIdentity, y: number): ScrollPosition | null {
  if (!nonnegative(y)) return null;
  const owner = { owner: identity.owner, generation: identity.generation };
  return Object.freeze({ identity: Object.freeze(identity.kind === "post"
    ? { ...owner, kind: "post" as const, postId: identity.postId }
    : { ...owner, kind: "feed" as const, mode: identity.mode, scope: identity.scope, pageCursor: identity.pageCursor }),
    y: Math.max(0, y) });
}

/** Restore only against a fresh authorized response and current laid-out bounds.
 * The caller rechecks read/mount identity before applying the returned offset. */
export function restoreScrollPosition(
  position: ScrollPosition | null, identity: ScrollIdentity,
  bounds: { contentHeight: number; viewportHeight: number }
): number | null {
  if (!position || !nonnegative(position.y) || !nonnegative(bounds.contentHeight) ||
    !Number.isFinite(bounds.viewportHeight) || bounds.viewportHeight <= 0) return null;
  const saved = position.identity;
  if (saved.owner !== identity.owner || saved.generation !== identity.generation) return null;
  if (identity.kind === "post") {
    if (saved.kind !== "post" || saved.postId !== identity.postId) return null;
  } else if (saved.kind !== "feed" || saved.mode !== identity.mode || saved.scope !== identity.scope ||
    saved.pageCursor !== identity.pageCursor) return null;
  return Math.max(0, Math.min(position.y, bounds.contentHeight - bounds.viewportHeight));
}
