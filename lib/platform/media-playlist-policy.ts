import { Prisma, type MediaPlaylist } from "@prisma/client";
import type { PostTx } from "./post-access";
import { type MediaContext, requireMediaActor } from "./media-catalog-policy";
import { verifiedChurchManagementQuery } from "./church-management";
import { ADULT_POLICY } from "./portal-types";
import { PortalError } from "./portal-policy";
import { postId } from "./post-input";

export const playlistUnavailable = () =>
  new PortalError(404, "This playlist is unavailable.");
export function playlistManagementWhere(
  c: MediaContext
): Prisma.MediaPlaylistWhereInput {
  if (!c.actorId || !c.eligible) return { id: { in: [] } };
  return {
    removedAt: null,
    OR: [
      { ownerId: c.actorId, ownerChurchId: null },
      { ownerId: null, ownerChurchId: { in: c.mediaManagers } },
      {
        ownerId: null,
        ownerChurchId: { in: c.mediaEditors },
        createdById: c.actorId,
        state: "DRAFT"
      }
    ]
  };
}
export function canPublishPlaylist(
  c: MediaContext,
  p: Pick<MediaPlaylist, "ownerId" | "ownerChurchId">
) {
  return !!(
    c.actorId &&
    c.eligible &&
    (p.ownerChurchId
      ? c.mediaManagers.includes(p.ownerChurchId)
      : p.ownerId === c.actorId)
  );
}
export async function managedPlaylist(
  tx: PostTx,
  c: MediaContext,
  id: unknown
) {
  requireMediaActor(c);
  const p = await tx.mediaPlaylist.findFirst({
    where: { AND: [{ id: postId(id) }, playlistManagementWhere(c)] }
  });
  if (!p) throw playlistUnavailable();
  return p;
}
const ids = (column: Prisma.Sql, values: string[]) =>
  values.length
    ? Prisma.sql`${column} IN (${Prisma.join(values)})`
    : Prisma.sql`FALSE`;

/** Container access never substitutes for the media reader's independent predicate. */
export function playlistReadableSql(c: MediaContext, now = new Date()) {
  return Prisma.sql`p.state='PUBLISHED' AND p."removedAt" IS NULL AND NOT p."recoveryRequired"
    AND p."publishedAt" IS NOT NULL AND p."publishedAt"<=${now.toISOString()}::timestamp
    AND ((p."ownerChurchId" IS NULL AND p."ownerId" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "PlatformUser" u WHERE u.id=p."ownerId" AND u."suspendedAt" IS NULL
        AND u."deactivatedAt" IS NULL AND u."emailVerifiedAt" IS NOT NULL AND u."adultAcknowledgedAt" IS NOT NULL AND u."adultPolicyVersion"=${ADULT_POLICY})
      AND NOT (${ids(Prisma.sql`p."ownerId"`, c.blockedIds ?? [])}))
      OR (p."ownerId" IS NULL AND p."ownerChurchId" IN (${verifiedChurchManagementQuery()})
        AND EXISTS (SELECT 1 FROM "Church" ch WHERE ch.id=p."ownerChurchId" AND (ch."communityListed" OR ${ids(Prisma.sql`ch.id`, c.churches)}))))
    AND (p.audience='PUBLIC' OR (p.audience='MEMBERS' AND ${!!c.eligible})
      OR (p.audience='CHURCH' AND ${ids(Prisma.sql`p."ownerChurchId"`, c.churches)})
      OR (p.audience='PRIVATE' AND p."ownerId"=${c.actorId} AND ${!!c.eligible}))`;
}

export async function requireReadablePlaylist(
  tx: PostTx,
  c: MediaContext,
  id: string
) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >(Prisma.sql`SELECT p.id FROM "MediaPlaylist" p
    WHERE p.id=${id} AND (${playlistReadableSql(c)})`);
  if (!rows.length) throw playlistUnavailable();
}
