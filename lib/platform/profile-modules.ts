import {
  profileFeaturedReferences,
  type ProfileFeaturedReference
} from "./profile-featured-input";
export type ProfileLink = { label: string; url: string };
const LEGACY_PROFILE_MODULE_ORDER = ["testimony", "skills", "links"] as const;
export const PROFILE_MODULE_ORDER = [
  ...LEGACY_PROFILE_MODULE_ORDER,
  "photos"
] as const;
export type ProfileModuleKind = (typeof PROFILE_MODULE_ORDER)[number];
export const profileModuleLabels: Record<ProfileModuleKind, string> = {
  testimony: "My testimony",
  skills: "Skills",
  links: "Links",
  photos: "Photos"
};
export type ProfileModules = {
  testimony: string;
  skills: string[];
  links: ProfileLink[];
  // Omitted by older clients. Their content edits must preserve a saved order.
  order?: ProfileModuleKind[];
  // A reference only. Member readers must resolve it through calendar policy.
  calendarOccurrenceId?: string | null;
  featuredResources?: ProfileFeaturedReference[];
  // Owned canonical photos only. Audience and metadata remain on their sources.
  photoIds?: string[];
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
  { kind: "photos", available: true },
  { kind: "introduction", available: true },
  { kind: "pinned-post", available: true },
  { kind: "calendar", available: true },
  { kind: "featured-media", available: true }
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
export function profilePhotoIds(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 6 ||
    value.some(
      (id) => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(id)
    ) ||
    new Set(value).size !== value.length
  )
    throw Error("Choose up to six distinct saved profile photos.");
  return [...value];
}
export function profileModuleOrder(value: ProfileModules): ProfileModuleKind[] {
  const order = value.order ?? [...LEGACY_PROFILE_MODULE_ORDER];
  return order.includes("photos") ? [...order] : [...order, "photos"];
}
/** Older writers may reorder text slots without moving the saved photos slot. */
export function mergeProfileModuleOrder(
  order: ProfileModuleKind[] | undefined,
  savedOrder: ProfileModuleKind[] | undefined
): ProfileModuleKind[] | undefined {
  if (!order) return savedOrder ? [...savedOrder] : undefined;
  if (order.includes("photos") || !savedOrder?.includes("photos"))
    return [...order];
  let textIndex = 0;
  return savedOrder.map((kind) =>
    kind === "photos" ? kind : order[textIndex++]
  );
}
export function validateProfileModules(value: unknown): ProfileModules {
  if (
    !object(value) ||
    !["testimony", "skills", "links"].every((key) =>
      Object.hasOwn(value, key)
    ) ||
    Object.keys(value).some(
      (key) =>
        ![
          "testimony",
          "skills",
          "links",
          "order",
          "calendarOccurrenceId",
          "featuredResources",
          "photoIds"
        ].includes(key)
    )
  )
    throw Error("Invalid profile modules");
  const hasOrder = Object.hasOwn(value, "order");
  const suppliedOrder = value.order;
  const hasCalendar = Object.hasOwn(value, "calendarOccurrenceId");
  const photoIds = Object.hasOwn(value, "photoIds")
    ? profilePhotoIds(value.photoIds)
    : undefined;
  const featuredResources = Object.hasOwn(value, "featuredResources")
    ? profileFeaturedReferences(value.featuredResources)
    : undefined;
  if (
    hasCalendar &&
    value.calendarOccurrenceId !== null &&
    (typeof value.calendarOccurrenceId !== "string" ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(value.calendarOccurrenceId))
  )
    throw Error("Invalid profile event reference");
  if (
    hasOrder &&
    (!Array.isArray(suppliedOrder) ||
      (suppliedOrder.length !== LEGACY_PROFILE_MODULE_ORDER.length &&
        suppliedOrder.length !== PROFILE_MODULE_ORDER.length) ||
      new Set(suppliedOrder).size !== suppliedOrder.length ||
      suppliedOrder.some((kind) => !PROFILE_MODULE_ORDER.includes(kind)) ||
      LEGACY_PROFILE_MODULE_ORDER.some((kind) => !suppliedOrder.includes(kind)))
  )
    throw Error("Invalid profile module order");
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
  return {
    testimony,
    skills,
    links,
    ...(featuredResources ? { featuredResources } : {}),
    ...(photoIds ? { photoIds } : {}),
    ...(hasOrder ? { order: [...(value.order as ProfileModuleKind[])] } : {}),
    ...(hasCalendar
      ? { calendarOccurrenceId: value.calendarOccurrenceId as string | null }
      : {})
  };
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
  const sections: ProfileModuleSection[] = [
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
  const order = profileModuleOrder(value);
  return sections.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}
