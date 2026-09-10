export const readerId = (value: unknown) =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value)
    ? value
    : undefined;
export const readerMode = (value: unknown) =>
  value === "pages" || value === "list" ? value : undefined;
export function readerDate(value: unknown) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 19) === value.slice(0, 19)
    ? new Date(value)
    : null;
}
export function touchTurn(
  dx: number,
  dy: number,
  milliseconds: number
): -1 | 0 | 1 {
  return milliseconds <= 650 &&
    milliseconds >= 0 &&
    Math.abs(dx) >= 80 &&
    Math.abs(dy) < 20
    ? dx > 0
      ? 1
      : -1
    : 0;
}
export type WheelGesture = {
  last: number;
  x: number;
  y: number;
  used: boolean;
};
export const newWheelGesture = (): WheelGesture => ({
  last: -Infinity,
  x: 0,
  y: 0,
  used: false
});
export function wheelTurn(
  previous: WheelGesture,
  sample: {
    x: number;
    y: number;
    time: number;
    mode: number;
    height: number;
    blocked: boolean;
  }
): { state: WheelGesture; delta: -1 | 0 | 1 } {
  const state =
    sample.time - previous.last > 260 ? newWheelGesture() : { ...previous };
  state.last = sample.time;
  if (sample.blocked) state.used = true;
  if (state.used) return { state, delta: 0 };
  const scale = sample.mode === 1 ? 16 : sample.mode === 2 ? sample.height : 1;
  state.x += sample.x * scale;
  state.y += Math.abs(sample.y * scale);
  if (state.y > 20 && state.y > Math.abs(state.x)) state.used = true;
  const delta =
    !state.used && Math.abs(state.x) >= 80 && Math.abs(state.x) > state.y * 2
      ? state.x > 0
        ? 1
        : -1
      : 0;
  if (delta) state.used = true;
  return { state, delta };
}
export function readerHref(
  href: string,
  id: string,
  mode: "pages" | "list",
  anchor?: { id: string; at: string }
) {
  const url = new URL(href, "https://reader.invalid");
  url.searchParams.set("post", id);
  url.searchParams.set("mode", mode);
  if (
    anchor &&
    (!readerDate(url.searchParams.get("through")) ||
      !readerId(url.searchParams.get("anchor")))
  ) {
    url.searchParams.set("through", anchor.at);
    url.searchParams.set("anchor", anchor.id);
  }
  return url.pathname + url.search + url.hash;
}
