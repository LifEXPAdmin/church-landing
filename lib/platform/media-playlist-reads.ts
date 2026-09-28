import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { withAccountRead } from "./account-read";
import {
  mediaContext,
  mediaReadableSql,
  requireMediaActor,
  type MediaContext
} from "./media-catalog-policy";
import { mediaPublicSelect, type MediaPublic } from "./media-catalog-reads";
import {
  playlistManagementWhere,
  managedPlaylist,
  canPublishPlaylist,
  requireReadablePlaylist,
  playlistUnavailable,
  playlistReadableSql
} from "./media-playlist-policy";
import {
  PLAYLIST_PAGE_LIMIT,
  PLAYLIST_ENTRY_LIMIT
} from "./media-playlist-input";
import { mediaText } from "./media-catalog-input";
import { postId } from "./post-input";
import { PortalError } from "./portal-policy";
import type { PostTx } from "./post-access";

export function playlistCursor(c: MediaContext, scope: unknown) {
  const sign = (body: string) =>
    createHmac("sha256", accountConfig().rateSecret)
      .update(
        JSON.stringify([
          "media-playlist-page-v1",
          c.actorId,
          c.eligible,
          [...c.churches].sort(),
          [...(c.blockedIds ?? [])].sort(),
          scope,
          body
        ])
      )
      .digest("hex");
  return {
    encode(offset: number) {
      const body = Buffer.from(JSON.stringify({ offset })).toString(
        "base64url"
      );
      return body + "." + sign(body);
    },
    decode(value: string | null) {
      if (!value) return 0;
      try {
        if (value.length > 300) throw Error();
        const [body, signature, extra] = value.split(".");
        if (
          extra ||
          !/^[A-Za-z0-9_-]+$/.test(body) ||
          !/^[a-f0-9]{64}$/.test(signature) ||
          !timingSafeEqual(Buffer.from(signature), Buffer.from(sign(body)))
        )
          throw Error();
        const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
        if (
          Object.keys(p).join() !== "offset" ||
          !Number.isSafeInteger(p.offset) ||
          p.offset < 0 ||
          p.offset > 10000
        )
          throw Error();
        return p.offset as number;
      } catch {
        throw new PortalError(
          409,
          "This playlist page changed. Refresh to see its current items."
        );
      }
    }
  };
}

export async function playlistMediaMap(tx: PostTx, ids: string[]) {
  // Callers obtain these IDs with mediaReadableSql in this locked read transaction.
  const unique = [...new Set(ids)];
  if (unique.length > 20000)
    throw new PortalError(413, "This media collection is too large.");
  const rows = unique.length
    ? await tx.mediaCatalogItem.findMany({
        where: { id: { in: unique } },
        select: mediaPublicSelect
      })
    : [];
  return new Map(rows.map((row) => [row.id, row]));
}

export async function playlistEntriesIn(
  tx: PostTx,
  c: MediaContext,
  id: string,
  management: boolean,
  offset: number,
  take = PLAYLIST_PAGE_LIMIT
) {
  const predicate = mediaReadableSql(c);
  const join = management
    ? Prisma.sql`LEFT JOIN "MediaCatalogItem" m ON m.id=e."mediaId" AND (${predicate})`
    : Prisma.sql`JOIN "MediaCatalogItem" m ON m.id=e."mediaId" AND (${predicate})`;
  const [rows, count] = await Promise.all([
    tx.$queryRaw<
      { id: string; mediaId: string | null }[]
    >(Prisma.sql`SELECT e.id,m.id AS "mediaId"
      FROM "MediaPlaylistEntry" e ${join} WHERE e."playlistId"=${id} ORDER BY e.position,e.id LIMIT ${take} OFFSET ${offset}`),
    tx.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`SELECT count(*) AS total FROM "MediaPlaylistEntry" e ${join} WHERE e."playlistId"=${id}`
    )
  ]);
  const map = await playlistMediaMap(
    tx,
    rows.flatMap((row) => (row.mediaId ? [row.mediaId] : []))
  );
  return {
    items: rows.map((row, i) => ({
      ...(management ? { entryId: row.id } : {}),
      position: offset + i + 1,
      media: row.mediaId ? (map.get(row.mediaId) ?? null) : null
    })),
    total: Number(count[0].total)
  };
}

export async function savedMediaIn(
  tx: PostTx,
  c: MediaContext,
  offset: number,
  take = PLAYLIST_PAGE_LIMIT
) {
  const rows = await tx.$queryRaw<
    { id: string; version: number; mediaId: string | null }[]
  >(Prisma.sql`SELECT s.id,s.version,m.id AS "mediaId"
    FROM "MediaSavedItem" s LEFT JOIN "MediaCatalogItem" m ON m.id=s."mediaId" AND (${mediaReadableSql(c)})
    WHERE s."userId"=${c.actorId} AND s."removedAt" IS NULL AND NOT s."recoveryRequired"
    ORDER BY s."createdAt" DESC,s.id LIMIT ${take} OFFSET ${offset}`);
  const map = await playlistMediaMap(
    tx,
    rows.flatMap((row) => (row.mediaId ? [row.mediaId] : []))
  );
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    media: row.mediaId ? (map.get(row.mediaId) ?? null) : null
  }));
}

export function mediaPlaylistRead(
  db: PrismaClient,
  token: unknown,
  query: URLSearchParams,
  expectedAccount?: string | null
) {
  const allowed = ["view", "id", "cursor", "q", "anchor"];
  if (
    [...query.keys()].some(
      (k) => !allowed.includes(k) || query.getAll(k).length !== 1
    )
  )
    throw new PortalError(400, "Choose supported playlist search fields.");
  const view = query.get("view") ?? "mine";
  if (!["mine", "saved", "editor", "detail", "public", "pick"].includes(view))
    throw new PortalError(400, "Choose an available playlist view.");
  if (query.has("anchor") && (view !== "editor" || query.has("cursor")))
    throw new PortalError(400, "Choose one editor page position.");
  return withAccountRead(db, token, async (tx, actorId) => {
    const c = await mediaContext(tx, actorId);
    if (expectedAccount && actorId !== expectedAccount)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
    if (!["detail", "public"].includes(view)) {
      requireMediaActor(c);
      if (!expectedAccount || actorId !== expectedAccount)
        throw new PortalError(
          401,
          "Reload your media workspace before continuing."
        );
    }
    if (view === "detail" || view === "editor") {
      const id = postId(query.get("id")),
        management = view === "editor";
      const p = management
        ? await managedPlaylist(tx, c, id)
        : (await requireReadablePlaylist(tx, c, id),
          await tx.mediaPlaylist.findUnique({ where: { id } }));
      if (!p) throw playlistUnavailable();
      const order = management
        ? (
            await tx.mediaPlaylistEntry.findMany({
              where: { playlistId: id },
              select: { id: true },
              orderBy: [{ position: "asc" }, { id: "asc" }],
              take: PLAYLIST_ENTRY_LIMIT
            })
          ).map((e) => e.id)
        : undefined;
      const anchor = query.has("anchor") ? postId(query.get("anchor")) : null;
      const anchorIndex = anchor ? order!.indexOf(anchor) : -1;
      if (anchor && anchorIndex < 0)
        throw new PortalError(
          409,
          "This item changed. Return to the first page to review the playlist."
        );
      const cursor = playlistCursor(c, [view, id, p.version]),
        offset = anchor
          ? Math.floor(anchorIndex / PLAYLIST_PAGE_LIMIT) * PLAYLIST_PAGE_LIMIT
          : cursor.decode(query.get("cursor"));
      const entries = await playlistEntriesIn(tx, c, id, management, offset);
      const owner = p.ownerChurchId
        ? await tx.church.findUnique({
            where: { id: p.ownerChurchId },
            select: { name: true }
          })
        : p.ownerId
          ? await tx.platformUser.findUnique({
              where: { id: p.ownerId },
              select: { name: true }
            })
          : null;
      return {
        actorId,
        view,
        playlist: {
          id: p.id,
          version: p.version,
          title: p.title,
          description: p.description,
          audience: p.audience,
          owner: owner?.name ?? "Unavailable owner",
          canManage: canPublishPlaylist(c, p),
          ...(management
            ? {
                state: p.state,
                churchOwned: !!p.ownerChurchId,
                canPublish: canPublishPlaylist(c, p),
                recoveryRequired: p.recoveryRequired,
                entryIds: order
              }
            : {})
        },
        ...entries,
        nextCursor:
          offset + entries.items.length < entries.total
            ? cursor.encode(offset + entries.items.length)
            : null
      };
    }
    const cursor = playlistCursor(c, [view, query.get("q") ?? ""]),
      offset = cursor.decode(query.get("cursor"));
    if (view === "saved") {
      const items = await savedMediaIn(tx, c, offset);
      const total = await tx.mediaSavedItem.count({
        where: { userId: actorId!, removedAt: null, recoveryRequired: false }
      });
      return {
        actorId,
        view,
        items,
        total,
        nextCursor:
          offset + items.length < total
            ? cursor.encode(offset + items.length)
            : null
      };
    }
    if (view === "pick") {
      const q = mediaText(query.get("q"), 160, "media search");
      const pattern = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
      const rows = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT m.id FROM "MediaCatalogItem" m WHERE (${mediaReadableSql(c)}) AND m.title ILIKE ${pattern} ORDER BY m."publishedAt" DESC,m.id LIMIT ${PLAYLIST_PAGE_LIMIT + 1} OFFSET ${offset}`
      );
      const ids = rows.slice(0, PLAYLIST_PAGE_LIMIT).map((r) => r.id),
        map = await playlistMediaMap(tx, ids);
      return {
        actorId,
        view,
        items: ids.map((id) => map.get(id)!).filter(Boolean),
        nextCursor:
          rows.length > PLAYLIST_PAGE_LIMIT
            ? cursor.encode(offset + PLAYLIST_PAGE_LIMIT)
            : null
      };
    }
    let rows;
    if (view === "mine")
      rows = await tx.mediaPlaylist.findMany({
        where: playlistManagementWhere(c),
        select: {
          id: true,
          version: true,
          title: true,
          description: true,
          audience: true,
          state: true,
          ownerChurchId: true,
          recoveryRequired: true
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: PLAYLIST_PAGE_LIMIT + 1,
        skip: offset
      });
    else
      rows = await tx.$queryRaw<
        {
          id: string;
          version: number;
          title: string;
          description: string;
          audience: string;
        }[]
      >(
        Prisma.sql`SELECT p.id,p.version,p.title,p.description,p.audience FROM "MediaPlaylist" p WHERE (${playlistReadableSql(c)}) ORDER BY p."publishedAt" DESC,p.id LIMIT ${PLAYLIST_PAGE_LIMIT + 1} OFFSET ${offset}`
      );
    const churches =
      view === "mine"
        ? await tx.church.findMany({
            where: {
              id: { in: [...new Set([...c.mediaEditors, ...c.mediaManagers])] }
            },
            select: { id: true, name: true },
            orderBy: { name: "asc" }
          })
        : undefined;
    return {
      actorId,
      view,
      items: rows.slice(0, PLAYLIST_PAGE_LIMIT),
      ...(churches ? { churches } : {}),
      nextCursor:
        rows.length > PLAYLIST_PAGE_LIMIT
          ? cursor.encode(offset + PLAYLIST_PAGE_LIMIT)
          : null
    };
  });
}

export type PlaylistMedia = MediaPublic;
