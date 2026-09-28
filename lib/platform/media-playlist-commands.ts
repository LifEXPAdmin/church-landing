import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { socialCommand, socialInput, socialKey } from "./social-operations";
import { postId } from "./post-input";
import { expected, PortalError } from "./portal-policy";
import { mediaContext, requireMediaActor } from "./media-catalog-policy";
import { mediaReadableIn } from "./media-catalog-reads";
import { requirePrivilegedAuthentication } from "./privileged-auth-policy";
import { recordDiscoveryControl } from "./retention-controls";
import {
  canPublishPlaylist,
  managedPlaylist,
  playlistUnavailable
} from "./media-playlist-policy";
import {
  playlistFields,
  playlistOrder,
  requireCompletePlaylistOrder,
  PLAYLIST_LIMIT,
  PLAYLIST_ENTRY_LIMIT,
  MEDIA_SAVE_LIMIT
} from "./media-playlist-input";
import type { PostTx } from "./post-access";

const operations = [
  "create",
  "update",
  "publish",
  "unpublish",
  "remove",
  "add",
  "remove-entry",
  "reorder",
  "save-media",
  "unsave-media"
];
async function authorize(
  tx: PostTx,
  actorId: string,
  op: string,
  v: Record<string, unknown>
) {
  const c = await mediaContext(tx, actorId);
  requireMediaActor(c);
  if (op === "save-media" || op === "unsave-media") {
    if (
      op === "save-media" &&
      !(await mediaReadableIn(tx, c, postId(v.mediaId)))
    )
      throw new PortalError(404, "This media item is unavailable.");
    const saved =
      op === "unsave-media"
        ? await tx.mediaSavedItem.findFirst({
            where: { id: postId(v.savedId), userId: actorId }
          })
        : null;
    if (op === "unsave-media" && !saved)
      throw new PortalError(404, "This saved item is unavailable.");
    return { c, row: null, church: null, saved };
  }
  if (op === "create") {
    const church = v.ownerChurchId === null ? null : postId(v.ownerChurchId);
    if (
      church &&
      !c.mediaEditors.includes(church) &&
      !c.mediaManagers.includes(church)
    )
      throw playlistUnavailable();
    if (church) await requirePrivilegedAuthentication(tx, actorId);
    return { c, row: null, church, saved: null };
  }
  const row =
    op === "remove"
      ? await tx.mediaPlaylist.findFirst({
          where: {
            id: postId(v.playlistId),
            OR: [
              { ownerId: actorId, ownerChurchId: null },
              { ownerId: null, ownerChurchId: { in: c.mediaManagers } }
            ]
          }
        })
      : await managedPlaylist(tx, c, v.playlistId);
  if (!row) throw playlistUnavailable();
  if (row.ownerChurchId) await requirePrivilegedAuthentication(tx, actorId);
  if (
    ["publish", "unpublish", "remove"].includes(op) &&
    !canPublishPlaylist(c, row)
  )
    throw playlistUnavailable();
  if (op === "add" && !(await mediaReadableIn(tx, c, postId(v.mediaId))))
    throw new PortalError(404, "This media item is unavailable.");
  return { c, row, church: row.ownerChurchId, saved: null };
}

export function mediaPlaylistCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  const op = String(input.operation);
  if (!operations.includes(op))
    throw new PortalError(400, "Choose a supported playlist action.");
  socialInput(input, [
    "operation",
    "mutationId",
    ...(op === "save-media"
      ? ["mediaId"]
      : op === "unsave-media"
        ? ["savedId", "expectedVersion"]
        : op === "create"
          ? ["ownerChurchId", "fields"]
          : ["playlistId", "expectedVersion"]),
    ...(["update", "publish"].includes(op) ? ["fields"] : []),
    ...(op === "add" ? ["mediaId"] : []),
    ...(op === "remove-entry" ? ["entryId"] : []),
    ...(op === "reorder" ? ["entryIds"] : [])
  ]);
  if (Buffer.byteLength(JSON.stringify(input)) > 32768)
    throw new PortalError(413, "These playlist entries are too large.");
  return socialCommand(
    db,
    token,
    "media-playlists",
    input,
    async (tx, actorId) => {
      const { row, church, saved } = await authorize(tx, actorId, op, input);
      const now = new Date();
      if (op === "save-media") {
        const mediaId = postId(input.mediaId);
        const prior = await tx.mediaSavedItem.findUnique({
          where: { userId_mediaId: { userId: actorId, mediaId } }
        });
        if (prior && !prior.removedAt && !prior.recoveryRequired)
          return {
            id: prior.id,
            version: prior.version,
            message: "Media already saved."
          };
        if (
          (await tx.mediaSavedItem.count({
            where: { userId: actorId, removedAt: null, recoveryRequired: false }
          })) >= MEDIA_SAVE_LIMIT
        )
          throw new PortalError(
            409,
            "You can keep up to 1,000 saved media items. Remove one before saving another."
          );
        const result = prior
          ? await tx.mediaSavedItem.update({
              where: { id: prior.id },
              data: {
                removedAt: null,
                recoveryRequired: false,
                createdAt: now,
                version: { increment: 1 },
                controlVersion: { increment: 1 }
              }
            })
          : await tx.mediaSavedItem.create({
              data: { id: randomUUID(), userId: actorId, mediaId }
            });
        await recordDiscoveryControl(
          tx,
          "MEDIA_SAVE",
          actorId,
          result.id,
          result.controlVersion
        );
        return {
          id: result.id,
          version: result.version,
          message: "Media saved privately."
        };
      }
      if (op === "unsave-media") {
        if (!saved) throw playlistUnavailable();
        expected(input.expectedVersion, saved.version);
        if (saved.removedAt)
          throw new PortalError(409, "This media item is already unsaved.");
        const result = await tx.mediaSavedItem.update({
          where: { id: saved.id },
          data: {
            removedAt: now,
            version: { increment: 1 },
            controlVersion: { increment: 1 }
          }
        });
        await recordDiscoveryControl(
          tx,
          "MEDIA_SAVE",
          actorId,
          result.id,
          result.controlVersion
        );
        return {
          id: result.id,
          version: result.version,
          message: "Media unsaved. Playlists are unchanged."
        };
      }
      if (row) expected(input.expectedVersion, row.version);
      if (row?.removedAt) throw playlistUnavailable();
      if (op === "create") {
        const fields = playlistFields(input.fields, !!church);
        if (
          (await tx.mediaPlaylist.count({
            where: {
              ownerId: church ? null : actorId,
              ownerChurchId: church,
              removedAt: null
            }
          })) >= PLAYLIST_LIMIT
        )
          throw new PortalError(
            409,
            "This owner can keep up to 100 playlists. Remove one before creating another."
          );
        const result = await tx.mediaPlaylist.create({
          data: {
            id: randomUUID(),
            ...fields,
            ownerId: church ? null : actorId,
            ownerChurchId: church,
            createdById: actorId
          }
        });
        await tx.mediaPlaylistEvent.create({
          data: {
            playlistId: result.id,
            actorId,
            action: op,
            version: result.version
          }
        });
        await recordDiscoveryControl(
          tx,
          "MEDIA_PLAYLIST",
          actorId,
          result.id,
          result.controlVersion
        );
        return {
          id: result.id,
          version: result.version,
          message: "Private playlist draft created."
        };
      }
      if (!row) throw playlistUnavailable();
      // A restored playlist must be deliberately reviewed and published again.
      if (row.recoveryRequired && !["update", "publish", "remove"].includes(op))
        throw new PortalError(
          409,
          "Review and save this recovered playlist before organizing its items."
        );
      let data: Prisma.MediaPlaylistUpdateInput = {
        version: { increment: 1 },
        controlVersion: { increment: 1 }
      };
      if (op === "update" || op === "publish") {
        data = {
          ...data,
          ...playlistFields(input.fields, !!church),
          recoveryRequired: false
        };
        if (op === "publish")
          data = { ...data, state: "PUBLISHED", publishedAt: now };
      } else if (op === "unpublish") {
        data = { ...data, state: "UNPUBLISHED", publishedAt: null };
      } else if (op === "remove") {
        await tx.mediaPlaylistEntry.deleteMany({
          where: { playlistId: row.id }
        });
        data = {
          ...data,
          state: "REMOVED",
          removedAt: now,
          publishedAt: null,
          title: "",
          description: ""
        };
      } else {
        const entries = await tx.mediaPlaylistEntry.findMany({
          where: { playlistId: row.id },
          select: { id: true, mediaId: true },
          orderBy: [{ position: "asc" }, { id: "asc" }],
          take: PLAYLIST_ENTRY_LIMIT + 1
        });
        if (entries.length > PLAYLIST_ENTRY_LIMIT)
          throw new PortalError(409, "This playlist needs a storage review.");
        if (op === "add") {
          const mediaId = postId(input.mediaId);
          if (entries.some((e) => e.mediaId === mediaId))
            return {
              id: row.id,
              version: row.version,
              message: "This media item is already in the playlist."
            };
          if (entries.length >= PLAYLIST_ENTRY_LIMIT)
            throw new PortalError(
              409,
              "A playlist holds up to 200 items. Remove one before adding another."
            );
          await tx.mediaPlaylistEntry.create({
            data: {
              id: randomUUID(),
              playlistId: row.id,
              mediaId,
              position: entries.length
            }
          });
        } else {
          let order: string[];
          if (op === "reorder") {
            order = playlistOrder(input.entryIds);
            requireCompletePlaylistOrder(
              order,
              entries.map((e) => e.id)
            );
          } else {
            const entryId = postId(input.entryId);
            if (!entries.some((e) => e.id === entryId))
              throw new PortalError(
                409,
                "This playlist entry changed. Refresh its current order."
              );
            await tx.mediaPlaylistEntry.delete({ where: { id: entryId } });
            order = entries.filter((e) => e.id !== entryId).map((e) => e.id);
          }
          // The shared account/permission transaction serializes church and personal edits.
          if (order.length)
            await tx.$executeRaw(Prisma.sql`UPDATE "MediaPlaylistEntry" e SET position=v.position
          FROM (VALUES ${Prisma.join(order.map((id, position) => Prisma.sql`(${id}::text,${position}::integer)`))}) AS v(id,position)
          WHERE e.id=v.id AND e."playlistId"=${row.id}`);
        }
      }
      const result = await tx.mediaPlaylist.update({
        where: { id: row.id },
        data
      });
      await tx.mediaPlaylistEvent.create({
        data: {
          playlistId: row.id,
          actorId,
          action: op,
          version: result.version
        }
      });
      await recordDiscoveryControl(
        tx,
        "MEDIA_PLAYLIST",
        actorId,
        row.id,
        result.controlVersion
      );
      return {
        id: row.id,
        version: result.version,
        message:
          op === "publish"
            ? "Playlist published. Each item keeps its own audience."
            : op === "remove"
              ? "Playlist removed. Saved media is unchanged."
              : "Playlist saved."
      };
    },
    async (tx, actorId) => {
      const a = await authorize(tx, actorId, op, input);
      const prior = await tx.socialOperation.findUnique({
        where: {
          ownerId_key: {
            ownerId: actorId,
            key: `media-playlists:${socialKey(input.mutationId)}`
          }
        }
      });
      if (!prior) return;
      const result = prior.result as unknown as { id: string };
      if (op === "create") await managedPlaylist(tx, a.c, result.id);
      if (
        op === "publish" &&
        (a.row?.state !== "PUBLISHED" || a.row.recoveryRequired)
      )
        throw playlistUnavailable();
      if (op === "save-media") {
        const saved = await tx.mediaSavedItem.findFirst({
          where: {
            id: result.id,
            userId: actorId,
            removedAt: null,
            recoveryRequired: false
          }
        });
        if (!saved)
          throw new PortalError(
            409,
            "This saved item changed. Refresh before saving again."
          );
      }
    }
  );
}
