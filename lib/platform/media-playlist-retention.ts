import { Prisma } from "@prisma/client";
import type { PostTx } from "./post-access";
import { mediaContext, mediaReadableSql } from "./media-catalog-policy";
import { playlistMediaMap, savedMediaIn } from "./media-playlist-reads";
import { recordDiscoveryControl } from "./retention-controls";

export async function exportMediaPlaylists(
  tx: PostTx,
  userId: string,
  limit: number
) {
  const c = await mediaContext(tx, userId);
  const personalMediaPlaylists = await tx.mediaPlaylist.findMany({
    where: {
      ownerId: userId,
      ownerChurchId: null,
      removedAt: null,
      recoveryRequired: false
    },
    select: {
      id: true,
      version: true,
      title: true,
      description: true,
      audience: true,
      state: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: { id: "asc" },
    take: limit + 1
  });
  const rows = await tx.$queryRaw<
    {
      id: string;
      playlistId: string;
      position: number;
      mediaId: string | null;
    }[]
  >(Prisma.sql`SELECT e.id,e."playlistId",e.position,m.id AS "mediaId"
    FROM "MediaPlaylistEntry" e JOIN "MediaPlaylist" p ON p.id=e."playlistId"
    LEFT JOIN "MediaCatalogItem" m ON m.id=e."mediaId" AND (${mediaReadableSql(c)})
    WHERE p."ownerId"=${userId} AND p."ownerChurchId" IS NULL AND p."removedAt" IS NULL AND NOT p."recoveryRequired"
    ORDER BY e."playlistId",e.position,e.id LIMIT ${limit + 1}`);
  const map = await playlistMediaMap(
    tx,
    rows.flatMap((r) => (r.mediaId ? [r.mediaId] : []))
  );
  const personalMediaPlaylistEntries = rows.map((r) => ({
    id: r.id,
    playlistId: r.playlistId,
    position: r.position + 1,
    media: r.mediaId ? (map.get(r.mediaId) ?? null) : null
  }));
  const savedMedia = await savedMediaIn(tx, c, 0, limit + 1);
  return { personalMediaPlaylists, personalMediaPlaylistEntries, savedMedia };
}

export async function eraseMediaPlaylists(
  tx: PostTx,
  userId: string,
  now: Date
) {
  const playlists = await tx.mediaPlaylist.findMany({
    where: { ownerId: userId, ownerChurchId: null },
    select: { id: true, controlVersion: true }
  });
  for (const p of playlists) {
    await tx.mediaPlaylistEntry.deleteMany({ where: { playlistId: p.id } });
    await tx.mediaPlaylist.update({
      where: { id: p.id },
      data: {
        title: "",
        description: "",
        ownerId: null,
        createdById: null,
        state: "REMOVED",
        removedAt: now,
        publishedAt: null,
        version: { increment: 1 },
        controlVersion: { increment: 1 }
      }
    });
    await recordDiscoveryControl(
      tx,
      "MEDIA_PLAYLIST",
      userId,
      p.id,
      p.controlVersion + 1
    );
  }
  const saves = await tx.mediaSavedItem.findMany({
    where: { userId },
    select: { id: true, controlVersion: true }
  });
  for (const s of saves) {
    await tx.mediaSavedItem.update({
      where: { id: s.id },
      data: {
        userId: null,
        mediaId: null,
        removedAt: now,
        version: { increment: 1 },
        controlVersion: { increment: 1 }
      }
    });
    await recordDiscoveryControl(
      tx,
      "MEDIA_SAVE",
      userId,
      s.id,
      s.controlVersion + 1
    );
  }
  await tx.mediaPlaylist.updateMany({
    where: { createdById: userId },
    data: { createdById: null }
  });
  await tx.mediaPlaylistEvent.updateMany({
    where: { actorId: userId },
    data: { actorId: null }
  });
}

export async function replayPlaylistControl(
  tx: PostTx,
  kind: "MEDIA_PLAYLIST" | "MEDIA_SAVE",
  id: string,
  version: number,
  now: Date
) {
  if (kind === "MEDIA_SAVE") {
    const prior = await tx.mediaSavedItem.findUnique({
      where: { id },
      select: { controlVersion: true }
    });
    if (prior && prior.controlVersion >= version) return;
    const data = {
      userId: null,
      mediaId: null,
      removedAt: now,
      recoveryRequired: true,
      version,
      controlVersion: version
    };
    await tx.mediaSavedItem.upsert({
      where: { id },
      create: { id, ...data },
      update: data
    });
    return;
  }
  const prior = await tx.mediaPlaylist.findUnique({
    where: { id },
    select: { controlVersion: true }
  });
  if (prior && prior.controlVersion >= version) return;
  await tx.mediaPlaylistEntry.deleteMany({ where: { playlistId: id } });
  const data = {
    title: "",
    description: "",
    state: "UNPUBLISHED",
    publishedAt: null,
    recoveryRequired: true,
    version,
    controlVersion: version
  };
  await tx.mediaPlaylist.upsert({
    where: { id },
    create: { id, ...data, createdAt: now },
    update: data
  });
}
