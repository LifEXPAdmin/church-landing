import { Prisma } from "@prisma/client";
import type { PostTx } from "./post-access";
import { MEDIA_POLICY } from "./media-catalog-options";
import { recordDiscoveryControl } from "./retention-controls";
export const mediaEmpty = {
  title: "",
  description: "",
  sourceUrl: null,
  sourceProvider: null,
  sourceState: "REVIEW_NEEDED",
  acknowledgment: null,
  attribution: "",
  speakers: [],
  churchCredit: "",
  series: "",
  sequence: null,
  topics: [],
  scriptureRanges: [],
  languageIds: [],
  details: Prisma.JsonNull,
  recordedOn: null,
  durationSeconds: null,
  transcriptText: "",
  chapters: []
};
export async function exportMedia(tx: PostTx, userId: string, limit: number) {
  // Church work and permission evidence about third parties are not personal account exports.
  const ids = await tx.$queryRaw<
    { id: string }[]
  >(Prisma.sql`SELECT m.id FROM "MediaCatalogItem" m
    WHERE m."ownerId"=${userId} AND m."ownerChurchId" IS NULL AND m."removedAt" IS NULL
    AND NOT m."recoveryRequired" AND m."moderationState"='VISIBLE'
    AND ((m.state='DRAFT' AND m."sourceState"='REVIEW_NEEDED') OR
      (m."sourceState"='ATTESTED' AND EXISTS(SELECT 1 FROM "MediaCatalogRights" r WHERE r."itemId"=m.id
        AND r."revokedAt" IS NULL AND (r."expiresAt" IS NULL OR r."expiresAt">${new Date().toISOString()}::timestamp)
        AND r.policy=${MEDIA_POLICY} AND r.fingerprint=m.acknowledgment))) ORDER BY m.id LIMIT ${limit + 1}`);
  return tx.mediaCatalogItem.findMany({
    where: { id: { in: ids.map((r) => r.id) } },
    select: {
      id: true,
      version: true,
      state: true,
      title: true,
      description: true,
      format: true,
      presentation: true,
      audience: true,
      durationSeconds: true,
      transcriptText: true,
      chapters: true,
      languageIds: true,
      speakers: true,
      churchCredit: true,
      series: true,
      sequence: true,
      topics: true,
      scriptureRanges: true,
      recordedOn: true,
      details: true,
      sourceUrl: true,
      attribution: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: { id: "asc" },
    take: limit + 1
  });
}
export async function eraseMedia(tx: PostTx, userId: string, now: Date) {
  const rows = await tx.mediaCatalogItem.findMany({
    where: { ownerId: userId, ownerChurchId: null },
    select: { id: true, controlVersion: true }
  });
  for (const r of rows) {
    await tx.mediaCatalogRights.deleteMany({ where: { itemId: r.id } });
    await tx.mediaCatalogItem.update({
      where: { id: r.id },
      data: {
        ...mediaEmpty,
        state: "REMOVED",
        removedAt: now,
        ownerId: null,
        createdById: null,
        version: { increment: 1 },
        controlVersion: { increment: 1 }
      }
    });
    await recordDiscoveryControl(
      tx,
      "MEDIA_CATALOG",
      userId,
      r.id,
      r.controlVersion + 1
    );
  }
  await tx.mediaCatalogItem.updateMany({
    where: { createdById: userId },
    data: { createdById: null }
  });
  await tx.mediaCatalogRights.updateMany({
    where: { actorId: userId },
    data: { actorId: null }
  });
  await tx.mediaCatalogEvent.updateMany({
    where: { actorId: userId },
    data: { actorId: null }
  });
}
export async function replayMediaControl(
  tx: PostTx,
  id: string,
  version: number,
  now: Date
) {
  const prior = await tx.mediaCatalogItem.findUnique({
    where: { id },
    select: { controlVersion: true }
  });
  if (prior && prior.controlVersion >= version) return;
  await tx.mediaCatalogRights.deleteMany({ where: { itemId: id } });
  const data = {
    ...mediaEmpty,
    state: "UNPUBLISHED",
    recoveryRequired: true,
    controlVersion: version,
    version
  };
  await tx.mediaCatalogItem.upsert({
    where: { id },
    create: { id, ...data, createdAt: now },
    update: data
  });
}
