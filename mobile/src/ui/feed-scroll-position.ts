import type { ReadingSnapshot } from "../reading/read-controller";

type Feed = Extract<ReadingSnapshot, { kind: "feed" }>["feed"];
export type FeedScrollIdentity = Readonly<Pick<Feed, "mode" | "scope" | "pageCursor"> & {
  owner: string; generation: number;
}>;
export type FeedScrollPosition = Readonly<{ identity: FeedScrollIdentity; y: number }>;

const nonnegative = (value: number) => Number.isFinite(value) && value >= 0;

/** The caller supplies a currently authorized page identity and owns one nullable
 * bookmark. Clear it before Refresh, mode/Next, concealment or error recovery,
 * and on owner/generation changes or unmount.
 * Current read/mount checks must fence callbacks; detail/loading cannot record.
 * This policy neither establishes access nor decides when layout is ready. */
export function captureFeedScrollPosition(identity: FeedScrollIdentity, y: number): FeedScrollPosition | null {
  if (!nonnegative(y)) return null;
  return Object.freeze({ identity: Object.freeze({
    owner: identity.owner, generation: identity.generation, mode: identity.mode,
    scope: identity.scope, pageCursor: identity.pageCursor
  }), y: Math.max(0, y) });
}

/** Restore only against a fresh authorized page and its current laid-out bounds.
 * The caller rechecks read/mount identity before applying the returned offset. */
export function restoreFeedScrollPosition(
  position: FeedScrollPosition | null, identity: FeedScrollIdentity,
  bounds: { contentHeight: number; viewportHeight: number }
): number | null {
  if (!position || !nonnegative(position.y) || !nonnegative(bounds.contentHeight) ||
    !Number.isFinite(bounds.viewportHeight) || bounds.viewportHeight <= 0) return null;
  const saved = position.identity;
  if (saved.owner !== identity.owner || saved.generation !== identity.generation ||
    saved.mode !== identity.mode || saved.scope !== identity.scope || saved.pageCursor !== identity.pageCursor) return null;
  return Math.max(0, Math.min(position.y, bounds.contentHeight - bounds.viewportHeight));
}
