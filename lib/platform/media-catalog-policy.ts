import { Prisma, type MediaCatalogItem } from "@prisma/client";
import { postContext, type PostContext, type PostTx } from "./post-access";
import { effectiveChurchGrants } from "./church-permissions";
import {
  verifiedChurchManagement,
  verifiedChurchManagementQuery
} from "./church-management";
import { privilegedProjectionAvailable } from "./privileged-auth-policy";
import { PortalError } from "./portal-policy";
import { ADULT_POLICY } from "./portal-types";
import { MEDIA_POLICY } from "./media-catalog-options";
export const mediaUnavailable = () =>
  new PortalError(404, "This media item is unavailable.");
export type MediaContext = PostContext & {
  mediaEditors: string[];
  mediaManagers: string[];
};
export async function mediaContext(
  tx: PostTx,
  actorId: string | null
): Promise<MediaContext> {
  const c = {
    ...(await postContext(tx, actorId)),
    mediaEditors: [] as string[],
    mediaManagers: [] as string[]
  };
  if (
    !c.actorId ||
    !c.eligible ||
    !c.churches.length ||
    !(await privilegedProjectionAvailable(tx, c.actorId))
  )
    return c;
  const managed = await verifiedChurchManagement(tx, c.churches);
  for (const g of await effectiveChurchGrants(tx, c.actorId, c.churches, [
    "EDIT_CHURCH_MEDIA",
    "MANAGE_CHURCH_MEDIA"
  ])) {
    if (managed.has(g.churchId))
      (g.capability === "MANAGE_CHURCH_MEDIA"
        ? c.mediaManagers
        : c.mediaEditors
      ).push(g.churchId);
  }
  return c;
}
export function requireMediaActor(c: MediaContext) {
  if (!c.actorId) throw new PortalError(401, "Sign in to manage your media.");
  if (!c.eligible)
    throw new PortalError(
      403,
      "Verify your email and confirm adult participation before managing media."
    );
  return c.actorId;
}
export function mediaManagementWhere(
  c: MediaContext
): Prisma.MediaCatalogItemWhereInput {
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
export function mediaCanPublish(
  c: MediaContext,
  r: Pick<MediaCatalogItem, "ownerId" | "ownerChurchId">
) {
  return !!(
    c.actorId &&
    c.eligible &&
    (r.ownerChurchId
      ? c.mediaManagers.includes(r.ownerChurchId)
      : r.ownerId === c.actorId)
  );
}
const ids = (column: Prisma.Sql, values: string[]) =>
  values.length
    ? Prisma.sql`${column} IN (${Prisma.join(values)})`
    : Prisma.sql`FALSE`;
/** Identical permission predicate for list, count, search and detail. No provider calls. */
export function mediaReadableSql(c: PostContext, now = new Date()) {
  // Prisma DateTime columns store UTC without a time zone. Bind canonical UTC
  // text as that same SQL type, independently of this connection's TimeZone.
  const utc = now.toISOString();
  return Prisma.sql`m.state='PUBLISHED' AND m."removedAt" IS NULL AND NOT m."recoveryRequired"
    AND m."moderationState"='VISIBLE' AND m."sourceState"='ATTESTED' AND m."sourceUrl" IS NOT NULL
    AND m."publishedAt" IS NOT NULL AND m."publishedAt"<=${utc}::timestamp
    AND EXISTS (SELECT 1 FROM "MediaCatalogRights" r WHERE r."itemId"=m.id AND r."revokedAt" IS NULL
      AND (r."expiresAt" IS NULL OR r."expiresAt">${utc}::timestamp) AND r.policy=${MEDIA_POLICY} AND r.fingerprint=m.acknowledgment)
    AND ((m."ownerChurchId" IS NULL AND m."ownerId" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "PlatformUser" u WHERE u.id=m."ownerId" AND u."suspendedAt" IS NULL
        AND u."deactivatedAt" IS NULL AND u."emailVerifiedAt" IS NOT NULL AND u."adultAcknowledgedAt" IS NOT NULL AND u."adultPolicyVersion"=${ADULT_POLICY})
      AND NOT (${ids(Prisma.sql`m."ownerId"`, c.blockedIds ?? [])}))
      OR (m."ownerId" IS NULL AND m."ownerChurchId" IN (${verifiedChurchManagementQuery()})
        AND EXISTS (SELECT 1 FROM "Church" ch WHERE ch.id=m."ownerChurchId" AND (ch."communityListed" OR ${ids(Prisma.sql`ch.id`, c.churches)}))))
    AND (m.audience='PUBLIC' OR (m.audience='MEMBERS' AND ${!!c.eligible}) OR (m.audience='CHURCH' AND ${ids(Prisma.sql`m."ownerChurchId"`, c.churches)}))`;
}
