import { brandColors, churchMarkPaths } from "./brand";

export type PublicShareCardInput = {
  title?: string;
  description?: string;
  variant?: "post" | "comment" | "church" | "event" | "topic";
};
export const shareCardSize = { width: 1200, height: 630 };
export const shareCardLabel = "God’s Churches: faith and community";
export const xmlText = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;"
      })[c]!
  );
function lines(value: string, width: number, count: number): string[] {
  const remaining = Array.from(
    value
      .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
      .replace(/\s+/gu, " ")
      .trim()
  );
  const result: string[] = [];
  while (remaining.length && result.length < count) {
    let take = Math.min(width, remaining.length);
    if (take < remaining.length) {
      const space = remaining.slice(0, take).lastIndexOf(" ");
      if (space > width / 2) take = space;
    }
    result.push(remaining.splice(0, take).join("").trim());
    while (remaining[0] === " ") remaining.shift();
  }
  if (remaining.length)
    result[result.length - 1] =
      Array.from(result.at(-1)!).slice(0, -1).join("") + "…";
  return result;
}
export const shareCardDecoration = `<rect width="1200" height="630" fill="${brandColors.paper}"/>
<rect x="28" y="28" width="1144" height="574" rx="24" fill="none" stroke="#d8dccf" stroke-width="2"/>
<g transform="translate(376 60) scale(2.5)" fill="none" stroke="${brandColors.olive}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${churchMarkPaths.map((d) => `<path d="${d}"/>`).join("")}</g>`;
export function shareCardLayout(input: PublicShareCardInput = {}) {
  const title = lines(
    input.title?.trim() || "Faith. Fellowship. Everyday life.",
    22,
    3
  );
  const detail = lines(
    input.description?.trim() ||
      "A place to grow in faith and connect with others.",
    38,
    2
  );
  const label = input.variant
    ? {
        post: "PUBLIC POST",
        comment: "PUBLIC CONVERSATION",
        church: "CHURCH COMMUNITY",
        event: "PUBLIC EVENT",
        topic: "PUBLIC TOPIC"
      }[input.variant]
    : "";
  return [
    {
      text: "God’s Churches",
      x: 456,
      y: 108,
      size: 44,
      weight: 400,
      anchor: "start",
      color: brandColors.ink
    },
    ...(label
      ? [
          {
            text: label,
            x: 600,
            y: 169,
            size: 16,
            weight: 600,
            anchor: "middle",
            color: brandColors.olive
          }
        ]
      : []),
    ...title.map((text, i) => ({
      text,
      x: 600,
      y: 230 + i * 62,
      size: 42,
      weight: 600,
      anchor: "middle",
      color: brandColors.ink
    })),
    ...detail.map((text, i) => ({
      text,
      x: 600,
      y: 444 + i * 34,
      size: 22,
      weight: 400,
      anchor: "middle",
      color: brandColors.ink
    })),
    {
      text: "Godschurches.com",
      x: 600,
      y: 554,
      size: 24,
      weight: 400,
      anchor: "middle",
      color: brandColors.olive
    }
  ];
}
export function shareCardBody(input: PublicShareCardInput = {}) {
  return (
    shareCardDecoration +
    shareCardLayout(input)
      .map(
        (line) =>
          `<text x="${line.x}" y="${line.y}" font-family="Noto Sans, Arial, sans-serif" text-anchor="${line.anchor}" font-size="${line.size}" font-weight="${line.weight}" fill="${line.color}">${xmlText(line.text)}</text>`
      )
      .join("")
  );
}
export function shareCardSvg(
  input: PublicShareCardInput = {},
  decorationOnly = false
) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${shareCardLabel}">${decorationOnly ? shareCardDecoration : shareCardBody(input)}</svg>`;
}
