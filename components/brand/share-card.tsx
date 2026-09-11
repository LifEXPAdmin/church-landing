import { brandColors, churchMarkPaths } from "../../lib/brand";

// Presentation only. The caller must supply approved public copy; this component
// neither loads records nor establishes eligibility. No remote images are fetched.
export type PublicShareCardInput = { title?: string; description?: string };
function lines(value: string, width: number, count: number): string[] {
  const remaining = Array.from(value.replace(/\s+/gu, " ").trim());
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
export function ShareCard({ title, description }: PublicShareCardInput = {}) {
  const heading = lines(
    title?.trim() || "Faith. Fellowship. Everyday life.",
    22,
    3
  );
  const detail = lines(
    description?.trim() || "A place to grow in faith and connect with others.",
    38,
    2
  );
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1200"
      height="630"
      viewBox="0 0 1200 630"
      role="img"
      aria-label="Godschurches community link preview"
    >
      <rect width="1200" height="630" fill={brandColors.paper} />
      <rect
        x="28"
        y="28"
        width="1144"
        height="574"
        rx="24"
        fill="none"
        stroke="#d8dccf"
        strokeWidth="2"
      />
      <g
        transform="translate(392 60) scale(2.5)"
        fill="none"
        stroke={brandColors.olive}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {churchMarkPaths.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <text
        x="477"
        y="108"
        fontFamily="Georgia, serif"
        fontSize="48"
        fill={brandColors.ink}
      >
        Godschurches
      </text>
      <g
        fontFamily="Arial, sans-serif"
        textAnchor="middle"
        fill={brandColors.ink}
      >
        {heading.map((line, i) => (
          <text key={i} x="600" y={230 + i * 62} fontSize="42" fontWeight="600">
            {line}
          </text>
        ))}
        {detail.map((line, i) => (
          <text key={i} x="600" y={444 + i * 34} fontSize="22">
            {line}
          </text>
        ))}
        <text x="600" y="554" fontSize="24" fill={brandColors.olive}>
          Godschurches.com
        </text>
      </g>
    </svg>
  );
}
