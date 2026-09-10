export type FeedGestureAxis = "horizontal" | "dismiss" | "scroll";

// A gesture that starts inside a long post stays a reading scroll, even if it
// reaches the edge. Closing needs a new, deliberate drag from an existing edge.
export function feedGestureAxis(
  dx: number,
  dy: number,
  top: boolean,
  bottom: boolean
): FeedGestureAxis | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return null;
  if (Math.abs(dx) > Math.abs(dy) * 1.3) return "horizontal";
  if (Math.abs(dy) > Math.abs(dx) * 1.3)
    return (dy > 0 && top) || (dy < 0 && bottom) ? "dismiss" : "scroll";
  return null;
}

export function feedGestureResult(
  axis: FeedGestureAxis | null,
  dx: number,
  dy: number,
  elapsed: number
): "next" | "previous" | "close" | null {
  if (
    axis === "horizontal" &&
    elapsed <= 900 &&
    Math.abs(dx) >= 48 &&
    Math.abs(dx) > Math.abs(dy) * 1.3
  )
    return dx < 0 ? "next" : "previous";
  if (
    axis === "dismiss" &&
    Math.abs(dy) >= 140 &&
    Math.abs(dy) > Math.abs(dx) * 1.3
  )
    return "close";
  return null;
}
