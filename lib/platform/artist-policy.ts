import { Prisma, type ArtistProfile } from "@prisma/client";
import type { PostContext, PostTx } from "./post-access";
import { eligibleWhere, PortalError } from "./portal-policy";
import { ARTIST_POLICY, type ArtistCapability } from "./artist-types";
import { ADULT_POLICY } from "./portal-types";
export const artistUnavailable = () =>
  new PortalError(404, "This artist or release is unavailable.");
export function requireArtistActor(c: PostContext) {
  if (!c.actorId) throw new PortalError(401, "Sign in to manage artists.");
  if (!c.eligible)
    throw new PortalError(
      403,
      "Verify your email and confirm adult participation before continuing."
    );
  return c.actorId;
}
export const artistManagementWhere = (
  c: PostContext
): Prisma.ArtistProfileWhereInput =>
  !c.actorId || !c.eligible
    ? { id: { in: [] } }
    : {
        removedAt: null,
        recoveryRequired: false,
        steward: eligibleWhere,
        stewardId: { notIn: c.blockedIds ?? [] },
        OR: [
          { stewardId: c.actorId },
          {
            delegates: {
              some: {
                accountId: c.actorId,
                state: "ACCEPTED",
                revokedAt: null,
                capabilities: {
                  hasSome: [
                    "EDIT_ARTIST_PROFILE",
                    "EDIT_ARTIST_RELEASES",
                    "PUBLISH_ARTIST_RELEASES"
                  ]
                }
              }
            }
          }
        ]
      };
export async function artistAuthority(tx: PostTx, c: PostContext, id: string) {
  const actorId = requireArtistActor(c),
    row = await tx.artistProfile.findFirst({
      where: {
        id,
        removedAt: null,
        recoveryRequired: false,
        steward: eligibleWhere
      }
    });
  if (!row || c.blockedIds?.includes(row.stewardId ?? ""))
    throw artistUnavailable();
  const delegate = await tx.artistDelegate.findUnique({
    where: { artistId_accountId: { artistId: id, accountId: actorId } }
  });
  const steward = row.stewardId === actorId,
    caps =
      delegate?.state === "ACCEPTED" && !delegate.revokedAt
        ? delegate.capabilities
        : [];
  return {
    row,
    steward,
    can: (cap: ArtistCapability) => steward || caps.includes(cap),
    delegate
  };
}
/** Shared public SQL predicate filters before counts, pagination and projection. */
export function artistReadableSql(c: PostContext, now = new Date()) {
  const utc = now.toISOString();
  return Prisma.sql`a.state='PUBLISHED' AND a."removedAt" IS NULL AND NOT a."recoveryRequired" AND a."moderationState"='VISIBLE'
 AND a."rightsFingerprint"=a.fingerprint AND a."rightsPolicy"=${ARTIST_POLICY} AND a."rightsAssertedAt" IS NOT NULL
 AND (a."rightsExpiresAt" IS NULL OR a."rightsExpiresAt">${utc}::timestamp)
 AND EXISTS(SELECT 1 FROM "PlatformUser" u WHERE u.id=a."stewardId" AND u."suspendedAt" IS NULL AND u."deactivatedAt" IS NULL AND u."emailVerifiedAt" IS NOT NULL AND u."adultAcknowledgedAt" IS NOT NULL AND u."adultPolicyVersion"=${ADULT_POLICY})
 AND EXISTS(SELECT 1 FROM "PlatformUser" u WHERE u.id=a."rightsActorId" AND u."suspendedAt" IS NULL AND u."deactivatedAt" IS NULL AND u."emailVerifiedAt" IS NOT NULL AND u."adultAcknowledgedAt" IS NOT NULL AND u."adultPolicyVersion"=${ADULT_POLICY})
 AND (a."rightsActorId"=a."stewardId" OR EXISTS(SELECT 1 FROM "ArtistDelegate" d WHERE d."artistId"=a.id AND d."accountId"=a."rightsActorId" AND d.state='ACCEPTED' AND d."revokedAt" IS NULL AND 'EDIT_ARTIST_PROFILE'=ANY(d.capabilities)))
 ${c.blockedIds?.length ? Prisma.sql`AND a."stewardId" NOT IN (${Prisma.join(c.blockedIds)}) AND a."rightsActorId" NOT IN (${Prisma.join(c.blockedIds)})` : Prisma.empty}`;
}
export function releaseReadableSql(c: PostContext, now = new Date()) {
  const utc = now.toISOString();
  return Prisma.sql`${artistReadableSql(c, now)} AND r.state='PUBLISHED' AND r."removedAt" IS NULL AND NOT r."recoveryRequired" AND r."moderationState"='VISIBLE'
 AND r."rightsFingerprint"=r.fingerprint AND r."rightsPolicy"=${ARTIST_POLICY} AND r."rightsAssertedAt" IS NOT NULL
 AND (r."rightsExpiresAt" IS NULL OR r."rightsExpiresAt">${utc}::timestamp)
 AND EXISTS(SELECT 1 FROM "PlatformUser" u WHERE u.id=r."rightsActorId" AND u."suspendedAt" IS NULL AND u."deactivatedAt" IS NULL AND u."emailVerifiedAt" IS NOT NULL AND u."adultAcknowledgedAt" IS NOT NULL AND u."adultPolicyVersion"=${ADULT_POLICY})
 AND (r."rightsActorId"=a."stewardId" OR EXISTS(SELECT 1 FROM "ArtistDelegate" d WHERE d."artistId"=a.id AND d."accountId"=r."rightsActorId" AND d.state='ACCEPTED' AND d."revokedAt" IS NULL AND 'PUBLISH_ARTIST_RELEASES'=ANY(d.capabilities)))
 ${c.blockedIds?.length ? Prisma.sql`AND r."rightsActorId" NOT IN (${Prisma.join(c.blockedIds)})` : Prisma.empty}`;
}
export async function artistPublicId(tx: PostTx, c: PostContext, id: string) {
  return !!(
    await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT a.id FROM "ArtistProfile" a WHERE a.id=${id} AND ${artistReadableSql(c)}`
    )
  ).length;
}
export function artistTombstone(row: ArtistProfile) {
  return row.state === "REMOVED" || !!row.removedAt || row.recoveryRequired;
}

/** Current assertion authority, independent of publication state or parent visibility. */
export async function artistAssertionCurrent(
  tx: PostTx,
  c: PostContext,
  artist: ArtistProfile,
  row: {
    rightsActorId: string | null;
    rightsPolicy: string | null;
    rightsFingerprint: string | null;
    fingerprint: string | null;
    rightsAssertedAt: Date | null;
    rightsExpiresAt: Date | null;
  },
  release = false
) {
  const actor = row.rightsActorId;
  if (
    !actor ||
    !row.rightsFingerprint ||
    row.rightsFingerprint !== row.fingerprint ||
    row.rightsPolicy !== ARTIST_POLICY ||
    !row.rightsAssertedAt ||
    (row.rightsExpiresAt && row.rightsExpiresAt <= new Date()) ||
    c.blockedIds?.includes(actor)
  )
    return false;
  if (
    !(await tx.platformUser.findFirst({
      where: { id: actor, ...eligibleWhere },
      select: { id: true }
    }))
  )
    return false;
  if (actor === artist.stewardId) return true;
  return !!(await tx.artistDelegate.findFirst({
    where: {
      artistId: artist.id,
      accountId: actor,
      state: "ACCEPTED",
      revokedAt: null,
      capabilities: {
        has: release ? "PUBLISH_ARTIST_RELEASES" : "EDIT_ARTIST_PROFILE"
      }
    },
    select: { id: true }
  }));
}
