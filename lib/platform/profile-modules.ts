export type ProfileLink = { label: string; url: string };
export type ProfileModules = {
  testimony: string;
  skills: string[];
  links: ProfileLink[];
};
export type ProfileModuleSection =
  | { kind: "testimony"; text: string }
  | { kind: "skills"; items: string[] }
  | { kind: "links"; items: ProfileLink[] };

export const PROFILE_MODULE_SLOTS = [
  { kind: "biography", available: true },
  { kind: "testimony", available: true },
  { kind: "skills", available: true },
  { kind: "links", available: true },
  { kind: "introduction", available: true },
  { kind: "pinned-post", available: true },
  { kind: "calendar", available: false },
  { kind: "featured-media", available: false }
] as const;

export function emptyProfileModules(): ProfileModules {
  return { testimony: "", skills: [], links: [] };
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown, maximum: number) {
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    // Preserve ordinary line breaks/tabs and complete Unicode code points.
    // Other C0 controls expand in JSON; NUL and lone surrogates cannot be JSONB.
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ud800-\udfff]/u.test(value)
  )
    throw Error("Invalid profile module");
  return value.trim();
}
export function validateProfileModules(value: unknown): ProfileModules {
  if (
    !object(value) ||
    Object.keys(value).sort().join() !== "links,skills,testimony"
  )
    throw Error("Invalid profile modules");
  const testimony = text(value.testimony, 2000);
  if (
    !Array.isArray(value.skills) ||
    value.skills.length > 10 ||
    !Array.isArray(value.links) ||
    value.links.length > 3
  )
    throw Error("Invalid profile modules");
  const skills = value.skills.map((skill) => text(skill, 60));
  if (
    skills.some((skill) => !skill) ||
    new Set(skills.map((skill) => skill.toLowerCase())).size !== skills.length
  )
    throw Error("Invalid profile skills");
  const links = value.links.map((link) => {
    if (!object(link) || Object.keys(link).sort().join() !== "label,url")
      throw Error("Invalid profile link");
    const label = text(link.label, 80),
      url = text(link.url, 500);
    const parsed = new URL(url);
    if (
      !label ||
      parsed.href.length > 500 ||
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      /[\u0000-\u0020\u007f]/.test(url)
    )
      throw Error("Invalid profile link");
    return { label, url: parsed.href };
  });
  return { testimony, skills, links };
}
// Old or malformed JSON is never projected as arbitrary profile content.
export function readProfileModules(value: unknown): ProfileModules {
  try {
    return validateProfileModules(value);
  } catch {
    return emptyProfileModules();
  }
}
export function profileModuleSections(
  value: ProfileModules
): ProfileModuleSection[] {
  return [
    ...(value.testimony
      ? [{ kind: "testimony" as const, text: value.testimony }]
      : []),
    ...(value.skills.length
      ? [{ kind: "skills" as const, items: value.skills }]
      : []),
    ...(value.links.length
      ? [{ kind: "links" as const, items: value.links }]
      : [])
  ];
}
