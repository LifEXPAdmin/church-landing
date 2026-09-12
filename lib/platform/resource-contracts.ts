/** Addresses and service ownership only. Registry membership is never permission. */
const implemented = <const T extends string>(authority: T) =>
  Object.freeze({ state: "implemented" as const, authority });
const reserved = <const T extends string>(contract: T) =>
  Object.freeze({ state: "reserved" as const, contract });

export const resourceContracts = Object.freeze({
  post: implemented("post-access/post-commands/post-workspace"),
  church: implemented("portal/church-permissions/church-claims"),
  eventOccurrence: implemented("calendar-access/calendar-commands"),
  imageAsset: implemented("media-access/media/personal-photo-policy"),
  personalPhoto: implemented("personal-photos/personal-photo-policy"),
  photoAlbum: implemented("photo-albums/personal-photo-policy"),
  setting: implemented(
    "setting-specific account/portal/relationship/browser adapter"
  ),
  exchangeListing: reserved(
    "listing ownership, audience, moderation and lifecycle"
  ),
  gatherGroup: reserved("group membership, leadership and audience"),
  mediaCatalogItem: reserved("catalog source, rights, audience and provider"),
  volunteerOpportunity: reserved(
    "independent application, coordinator and capacity"
  ),
  fundraisingCampaign: reserved(
    "organizer, beneficiary, external destination and review"
  )
});

export type ResourceKind = keyof typeof resourceContracts;
export type ImplementedResourceKind = {
  [K in ResourceKind]: (typeof resourceContracts)[K]["state"] extends "implemented"
    ? K
    : never;
}[ResourceKind];

/** Scope references are untrusted input until checked against the current session. */
export type SettingScope =
  | { kind: "browser" }
  | { kind: "personal"; userId: string }
  | { kind: "church"; churchId: string };

export type ResourceReference<K extends ResourceKind = ResourceKind> = {
  [R in K]: R extends "setting"
    ? { kind: R; settingId: string; scope: SettingScope }
    : { kind: R; id: string };
}[K];

export class ResourceUnavailableError extends Error {
  readonly status = 503;
  constructor() {
    super("This feature is not available.");
    this.name = "ResourceUnavailableError";
  }
}

/**
 * A routing precondition for adapters, never row-level authorization.
 * Implemented services still check their own provider/feature/current-access gates.
 * There is no caller-supplied flag or service name that can activate a reserved kind.
 */
export function requireImplementedResource(kind: unknown) {
  if (
    typeof kind !== "string" ||
    !Object.hasOwn(resourceContracts, kind) ||
    resourceContracts[kind as ResourceKind].state !== "implemented"
  )
    throw new ResourceUnavailableError();
  return resourceContracts[kind as ImplementedResourceKind];
}
