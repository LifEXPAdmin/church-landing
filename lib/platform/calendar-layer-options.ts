// Decorative choices accompany source names; color never conveys authority.
export const CALENDAR_LAYER_COLORS = [
  { value: "DEFAULT", label: "Default", swatch: "#68736b" },
  { value: "BLUE", label: "Blue", swatch: "#2563eb" },
  { value: "GREEN", label: "Green", swatch: "#15803d" },
  { value: "PURPLE", label: "Purple", swatch: "#7e22ce" },
  { value: "ORANGE", label: "Orange", swatch: "#c2410c" },
  { value: "ROSE", label: "Rose", swatch: "#be123c" }
] as const;

export type CalendarLayerColor =
  (typeof CALENDAR_LAYER_COLORS)[number]["value"];
export function calendarLayerColor(value: unknown) {
  return CALENDAR_LAYER_COLORS.find((color) => color.value === value);
}
