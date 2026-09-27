import { PortalError } from "./portal-policy";
import { postId } from "./post-input";
import { requireImplementedResource } from "./resource-contracts";
import { socialInput } from "./social-operations";

export const POST_RESOURCE_LIMIT = 3;
export const postResourceKinds = [
  "exchangeListing",
  "eventOccurrence",
  "volunteerOpportunity"
] as const;
export type PostResourceKind = (typeof postResourceKinds)[number];
export type PostResourceReference = { kind: PostResourceKind; id: string };
export function postResourceReferences(
  value: unknown
): PostResourceReference[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > POST_RESOURCE_LIMIT)
    throw new PortalError(400, "Choose up to three resource cards.");
  const rows = value.map((row) => {
    socialInput(row, ["kind", "id"]);
    if (!postResourceKinds.includes(row.kind))
      throw new PortalError(
        400,
        "Choose an available listing, event or opportunity."
      );
    requireImplementedResource(row.kind);
    return { kind: row.kind as PostResourceKind, id: postId(row.id) };
  });
  if (new Set(rows.map(resourceKey)).size !== rows.length)
    throw new PortalError(400, "Choose each resource only once.");
  return rows;
}
export const resourceKey = (row: PostResourceReference) =>
  `${row.kind}:${row.id}`;

/** Malformed retained data is unavailable, never an implicit public selection. */
export function storedPostResources(value: unknown): PostResourceReference[] {
  try {
    return postResourceReferences(value);
  } catch {
    return [];
  }
}
