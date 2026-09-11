export type ChurchReturnContext = {
  from: "chart" | "outline" | "directory" | "responsibilities" | "person";
  focus: string;
};

export function churchFocus(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value)
    ? value
    : undefined;
}

// A return is a known church view and a position/contact ID, never an arbitrary
// URL. The destination rechecks membership and current directory consent.
export function churchReturnContext(
  from: unknown,
  focus: unknown
): ChurchReturnContext | undefined {
  const id = churchFocus(focus);
  if (
    !id ||
    typeof from !== "string" ||
    !["chart", "outline", "directory", "responsibilities", "person"].includes(
      from
    )
  )
    return undefined;
  return { from: from as ChurchReturnContext["from"], focus: id };
}

export function churchReturnQuery(context?: ChurchReturnContext): string {
  return context ? new URLSearchParams(context).toString() : "";
}

export function churchReturnHref(
  churchId: string,
  context: ChurchReturnContext
): string {
  const base = `/platform/churches/${encodeURIComponent(churchId)}`;
  if (context.from === "person")
    return `${base}/people/${encodeURIComponent(context.focus)}`;
  const query = new URLSearchParams({ focus: context.focus });
  if (context.from === "outline") query.set("mode", "outline");
  const path =
    context.from === "chart" || context.from === "outline"
      ? "structure"
      : context.from;
  return `${base}/${path}?${query}`;
}

export function churchReturnLabel(context: ChurchReturnContext): string {
  return {
    chart: "Back to church chart",
    outline: "Back to full outline",
    directory: "Back to people",
    responsibilities: "Back to my responsibilities",
    person: "Back to contact card"
  }[context.from];
}
