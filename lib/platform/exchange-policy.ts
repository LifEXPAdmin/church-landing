import type { ExchangeListing, Prisma } from "@prisma/client";
import type { PostContext, PostTx } from "./post-access";
import { effectiveChurchGrants } from "./church-permissions";
import { eligibleWhere, PortalError } from "./portal-policy";
import { socialUserWhere } from "./social-policy";
import { privilegedProjectionAvailable } from "./privileged-auth-policy";

export type ExchangeAuthority = {
  publishers: string[];
  managers: string[];
  moderators: string[];
};
export async function exchangeAuthority(tx: PostTx, context: PostContext): Promise<ExchangeAuthority> {
  const result: ExchangeAuthority = { publishers: [], managers: [], moderators: [] };
  if (!context.actorId || !context.eligible || !context.churches.length ||
    !(await privilegedProjectionAvailable(tx, context.actorId))) return result;
  const grants = await effectiveChurchGrants(tx, context.actorId, context.churches,
    ["PUBLISH_EXCHANGE_LISTINGS", "MANAGE_EXCHANGE_LISTINGS", "MODERATE_EXCHANGE_LISTINGS"]);
  for (const grant of grants) {
    const list = grant.capability === "PUBLISH_EXCHANGE_LISTINGS" ? result.publishers
      : grant.capability === "MANAGE_EXCHANGE_LISTINGS" ? result.managers : result.moderators;
    if (!list.includes(grant.churchId)) list.push(grant.churchId);
  }
  return result;
}

export function requireExchangeActor(context: PostContext): string {
  if (!context.actorId) throw new PortalError(401, "Sign in to manage your listings.");
  if (!context.eligible)
    throw new PortalError(403, "Verify your email and confirm adult participation before managing listings.");
  return context.actorId;
}

// The composite connection reference binds a personal church audience to the
// actual owner and church. A revoked membership never becomes a public listing.
export function exchangeReadableWhere(context: PostContext): Prisma.ExchangeListingWhereInput {
  return {
    erasedAt: null,
    recoveryRequired: false,
    state: { in: ["ACTIVE", "RESERVED", "CLOSED"] },
    moderationState: "VISIBLE",
    publishedAt: { not: null },
    AND: [
      { OR: [
        { ownerChurchId: null, owner: { ...socialUserWhere(context), ...eligibleWhere } },
        { ownerId: null, ownerChurch: { OR: [
          { communityListed: true }, { id: { in: context.churches } }
        ] } }
      ] },
      { OR: [
        { audience: "PUBLIC" },
        { audience: "CHURCH", audienceChurchId: { in: context.churches }, OR: [
          { ownerChurchId: { not: null } },
          { personalAudienceConnection: { state: "APPROVED" } }
        ] }
      ] }
    ]
  };
}
export function exchangeDiscoveryWhere(context: PostContext): Prisma.ExchangeListingWhereInput {
  return {
    AND: [exchangeReadableWhere(context), { state: { in: ["ACTIVE", "RESERVED"] } },
      { OR: [
        { ownerChurchId: null, ownerId: { notIn: context.mutedIds ?? [] } },
        { ownerChurchId: { not: null, notIn: context.mutedChurchIds ?? [] } }
      ] }]
  };
}
export function exchangeManagementWhere(context: PostContext, authority: ExchangeAuthority): Prisma.ExchangeListingWhereInput {
  if (!context.actorId || !context.eligible) return { id: { in: [] } };
  return { erasedAt: null, OR: [
    { ownerId: context.actorId, ownerChurchId: null },
    { ownerId: null, ownerChurchId: { in: authority.managers } },
    { ownerId: null, ownerChurchId: { in: authority.publishers }, creatorId: context.actorId, state: "DRAFT" }
  ] };
}
export function exchangeCanManage(context: PostContext, authority: ExchangeAuthority,
  listing: Pick<ExchangeListing, "ownerId" | "ownerChurchId" | "creatorId" | "state" | "erasedAt">) {
  return !!(context.actorId && context.eligible && !listing.erasedAt &&
    (listing.ownerChurchId
      ? authority.managers.includes(listing.ownerChurchId) ||
        (listing.state === "DRAFT" && listing.creatorId === context.actorId && authority.publishers.includes(listing.ownerChurchId))
      : listing.ownerId === context.actorId));
}
export function exchangeReportScope(listing: Pick<ExchangeListing, "ownerChurchId" | "audience" | "audienceChurchId">) {
  return listing.ownerChurchId ?? (listing.audience === "CHURCH" ? listing.audienceChurchId : null);
}
