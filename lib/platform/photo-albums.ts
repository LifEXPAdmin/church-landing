import { createHmac, timingSafeEqual } from "node:crypto";
import type { Prisma, PrismaClient, PhotoAlbum } from "@prisma/client";
import { accountConfig } from "./account-config";
import { expected, PortalError } from "./portal-policy";
import { postContext, withPostRead, type PostContext } from "./post-access";
import { postField, postId } from "./post-input";
import { socialUserWhere } from "./social-policy";
import { socialCommand, socialInput } from "./social-operations";
import { projectImage } from "./media";
import {
  checkPhotoAudience,
  directPhotoAudience,
  readableAssetWhere,
  requirePhotoLibrary,
  PHOTO_PAGE_SIZE,
  photoAlbumsEnabled
} from "./personal-photo-policy";
export const PHOTO_ALBUM_LIMIT = 50;
export const PHOTO_ALBUM_SIZE = 100;
function requireAlbums() {
  requirePhotoLibrary();
  if (!photoAlbumsEnabled())
    throw new PortalError(
      503,
      "Named albums are not available yet. Your photos are unchanged."
    );
}
function albumAudience(value: unknown, church: unknown) {
  const audience = directPhotoAudience(value, church);
  if (audience.audience === "PUBLIC")
    throw new PortalError(
      400,
      "Choose Only me, Members or Church for a profile album."
    );
  return audience;
}
function albumWhere(
  context: PostContext,
  ownerId: string
): Prisma.PhotoAlbumWhereInput {
  return {
    ownerId,
    OR: [
      { ownerId: context.actorId ?? "" },
      { audience: "MEMBERS" },
      { audience: "CHURCH", audienceChurchId: { in: context.churches } }
    ]
  };
}
function entryWhere(
  context: PostContext,
  canManage: boolean
): Prisma.PhotoAlbumEntryWhereInput {
  return {
    photo: {
      deletedAt: null,
      ...(canManage ? {} : { hiddenAt: null }),
      asset: readableAssetWhere(context)
    }
  };
}
function cursorFor(scope: string) {
  const sign = (body: string) =>
    createHmac("sha256", accountConfig().rateSecret)
      .update("album:" + scope + ":" + body)
      .digest("hex");
  return {
    encode(position: number) {
      const body = String(position);
      return body + "." + sign(body);
    },
    decode(value: unknown) {
      if (!value) return -1;
      if (typeof value === "string") {
        const [body, hash, extra] = value.split(".");
        if (
          !extra &&
          /^\d{1,2}$/.test(body) &&
          /^[a-f0-9]{64}$/.test(hash ?? "") &&
          timingSafeEqual(Buffer.from(hash), Buffer.from(sign(body)))
        )
          return Number(body);
      }
      throw new PortalError(
        409,
        "This album or page changed. Reload the album before continuing."
      );
    }
  };
}
function metadata(row: PhotoAlbum) {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    audience: row.audience,
    audienceChurchId: row.audienceChurchId,
    coverAssetId: row.coverAssetId
  };
}
export function readPhotoAlbums(
  db: PrismaClient,
  token: unknown,
  input: {
    profileId: unknown;
    id?: unknown;
    after?: unknown;
    edit?: unknown;
    preview?: unknown;
  }
) {
  requireAlbums();
  return withPostRead(db, token, async (tx, context) => {
    if (!context.actorId)
      throw new PortalError(401, "Sign in to view profile albums.");
    const actorId = context.actorId,
      profileId = postId(input.profileId);
    if (
      !(await tx.platformUser.findFirst({
        where: { AND: [{ id: profileId }, socialUserWhere(context)] },
        select: { id: true }
      }))
    )
      throw new PortalError(404, "These albums are unavailable.");
    const memberPreview = input.preview === "member" && actorId === profileId;
    if (memberPreview)
      context = {
        actorId: "member-preview",
        churches: [],
        publishers: new Set(),
        moderators: new Set(),
        volunteers: new Set()
      };
    const canManage = actorId === profileId && !memberPreview,
      visibleEntry = entryWhere(context, canManage);
    const rows = await tx.photoAlbum.findMany({
      where: {
        AND: [
          albumWhere(context, profileId),
          ...(input.id ? [{ id: postId(input.id) }] : [])
        ]
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PHOTO_ALBUM_LIMIT + 1,
      include: {
        _count: { select: { entries: { where: visibleEntry } } },
        entries: {
          where: visibleEntry,
          orderBy: { position: "asc" },
          take: 1,
          include: { photo: { include: { asset: true } } }
        }
      }
    });
    if (rows.length > PHOTO_ALBUM_LIMIT)
      throw new PortalError(
        503,
        "This album list needs a size review. Nothing was removed."
      );
    if (input.id && !rows.length)
      throw new PortalError(404, "This album is unavailable.");
    const covers = await tx.photoAlbumEntry.findMany({
      where: {
        AND: [
          visibleEntry,
          {
            OR: rows
              .filter((row) => row.coverAssetId)
              .map((row) => ({ albumId: row.id, assetId: row.coverAssetId! }))
          }
        ]
      },
      include: { photo: { include: { asset: true } } },
      take: PHOTO_ALBUM_LIMIT
    });
    const coverMap = new Map(
      covers.map((row) => [row.albumId, row.photo.asset])
    );
    const albums = rows.map((row) => ({
      ...metadata(row),
      coverAssetId: canManage
        ? row.coverAssetId
        : (coverMap.get(row.id)?.id ?? row.entries[0]?.assetId ?? null),
      total: row._count.entries,
      cover: coverMap.has(row.id)
        ? projectImage(coverMap.get(row.id)!)
        : row.entries[0]
          ? projectImage(row.entries[0].photo.asset)
          : null
    }));
    const selected = input.id ? rows[0] : null;
    const cursor = selected
      ? cursorFor(
          `${context.actorId}:${profileId}:${selected.id}:${selected.version}`
        )
      : null;
    const position = cursor?.decode(input.after) ?? -1;
    const page = selected
      ? await tx.photoAlbumEntry.findMany({
          where: {
            AND: [
              visibleEntry,
              { albumId: selected.id, position: { gt: position } }
            ]
          },
          orderBy: { position: "asc" },
          take: PHOTO_PAGE_SIZE + 1,
          include: { photo: { include: { asset: true } } }
        })
      : [];
    let editing:
      | {
          id: string;
          photoVersion: number;
          imageVersion: number;
          image: ReturnType<typeof projectImage> | null;
        }[]
      | null = null;
    if (input.edit === "true") {
      if (!selected || !canManage)
        throw new PortalError(404, "Album editing is unavailable.");
      const entries = await tx.photoAlbumEntry.findMany({
        where: { albumId: selected.id },
        orderBy: { position: "asc" },
        include: { photo: { include: { asset: true } } },
        take: PHOTO_ALBUM_SIZE + 1
      });
      if (entries.length > PHOTO_ALBUM_SIZE)
        throw new PortalError(
          503,
          "This album needs a size review. Nothing was removed."
        );
      const readable = new Set(
        (
          await tx.photoAlbumEntry.findMany({
            where: { AND: [visibleEntry, { albumId: selected.id }] },
            select: { assetId: true },
            take: PHOTO_ALBUM_SIZE
          })
        ).map((row) => row.assetId)
      );
      editing = entries.map((row) => ({
        id: row.assetId,
        photoVersion: row.photo.version,
        imageVersion: row.photo.asset.version,
        image: readable.has(row.assetId) ? projectImage(row.photo.asset) : null
      }));
    }
    return {
      profileId,
      canManage,
      limit: PHOTO_ALBUM_LIMIT,
      albumSize: PHOTO_ALBUM_SIZE,
      pageSize: PHOTO_PAGE_SIZE,
      albums,
      album: selected ? albums[0] : null,
      editing,
      images: page.slice(0, PHOTO_PAGE_SIZE).map((row) => ({
        ...projectImage(row.photo.asset),
        sourcePostId: row.photo.asset.postId
      })),
      nextCursor:
        page.length > PHOTO_PAGE_SIZE
          ? cursor!.encode(page[PHOTO_PAGE_SIZE - 1].position)
          : null
    };
  });
}
export type PhotoAlbumsView = Awaited<ReturnType<typeof readPhotoAlbums>>;
export function photoAlbumCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  requireAlbums();
  socialInput(input, [
    "operation",
    "mutationId",
    "id",
    "expectedVersion",
    "name",
    "audience",
    "audienceChurchId",
    "coverAssetId",
    "photos",
    "confirmed"
  ]);
  return socialCommand(db, token, "photo-album", input, async (tx, ownerId) => {
    const context = await postContext(tx, ownerId);
    if (input.operation === "create") {
      if (input.expectedVersion !== 0)
        throw new PortalError(
          409,
          "Create a new album with its initial version."
        );
      if (
        (await tx.photoAlbum.count({ where: { ownerId } })) >= PHOTO_ALBUM_LIMIT
      )
        throw new PortalError(
          409,
          "You can keep up to 50 named albums. Delete an unneeded album first; its photos will remain."
        );
      const name = postField(input.name, 100);
      if (!name) throw new PortalError(400, "Give your album a name.");
      const privacy = albumAudience(input.audience, input.audienceChurchId);
      checkPhotoAudience(context, privacy);
      if (input.photos != null || input.coverAssetId != null)
        throw new PortalError(
          400,
          "Create the album before choosing its photos."
        );
      const album = await tx.photoAlbum.create({
        data: { ownerId, name, ...privacy }
      });
      return {
        id: album.id,
        version: album.version,
        message:
          "Album created. Add your saved photos without uploading them again."
      };
    }
    const album = await tx.photoAlbum.findFirst({
      where: { id: postId(input.id), ownerId }
    });
    if (!album) throw new PortalError(404, "This album is unavailable.");
    expected(input.expectedVersion, album.version);
    if (input.operation === "delete") {
      if (input.confirmed !== true)
        throw new PortalError(
          400,
          "Confirm deletion of the album. Its photos will remain in your library."
        );
      await tx.photoAlbumEntry.deleteMany({ where: { albumId: album.id } });
      await tx.photoAlbum.delete({ where: { id: album.id } });
      return {
        id: album.id,
        version: album.version + 1,
        message: "Album deleted. Its photos remain in your library."
      };
    }
    if (input.operation !== "save")
      throw new PortalError(400, "Choose a supported album action.");
    const name = postField(input.name, 100);
    if (!name) throw new PortalError(400, "Give your album a name.");
    const privacy = albumAudience(input.audience, input.audienceChurchId);
    checkPhotoAudience(context, privacy);
    if (!Array.isArray(input.photos) || input.photos.length > PHOTO_ALBUM_SIZE)
      throw new PortalError(
        400,
        "Choose up to 100 different owned photos for this album."
      );
    const photos = input.photos.map((value) => {
      socialInput(value as Record<string, unknown>, [
        "id",
        "photoVersion",
        "imageVersion"
      ]);
      return {
        id: postId(value.id),
        photoVersion: value.photoVersion,
        imageVersion: value.imageVersion
      };
    });
    const ids = photos.map((row) => row.id);
    if (new Set(ids).size !== ids.length)
      throw new PortalError(400, "Each photo belongs in an album only once.");
    const prior = new Set(
      (
        await tx.photoAlbumEntry.findMany({
          where: { albumId: album.id },
          select: { assetId: true },
          take: PHOTO_ALBUM_SIZE + 1
        })
      ).map((row) => row.assetId)
    );
    const records = await tx.personalPhoto.findMany({
      where: { ownerId, assetId: { in: ids } },
      include: { asset: true },
      take: PHOTO_ALBUM_SIZE
    });
    const readable = new Set(
      (
        await tx.personalPhoto.findMany({
          where: {
            ownerId,
            assetId: { in: ids },
            deletedAt: null,
            asset: readableAssetWhere(context)
          },
          select: { assetId: true },
          take: PHOTO_ALBUM_SIZE
        })
      ).map((row) => row.assetId)
    );
    for (const photo of photos) {
      const row = records.find((record) => record.assetId === photo.id);
      if (!row || (!prior.has(photo.id) && !readable.has(photo.id)))
        throw new PortalError(
          409,
          "A selected photo is no longer available to add. Reload your library and review the album."
        );
      expected(photo.photoVersion, row.version);
      expected(photo.imageVersion, row.asset.version);
    }
    const coverAssetId =
      input.coverAssetId == null || input.coverAssetId === ""
        ? null
        : postId(input.coverAssetId);
    if (coverAssetId && !ids.includes(coverAssetId))
      throw new PortalError(
        400,
        "Choose the cover from the photos in this album."
      );
    await tx.photoAlbumEntry.deleteMany({ where: { albumId: album.id } });
    if (photos.length)
      await tx.photoAlbumEntry.createMany({
        data: photos.map((photo, position) => ({
          albumId: album.id,
          ownerId,
          assetId: photo.id,
          position
        }))
      });
    const saved = await tx.photoAlbum.update({
      where: { id: album.id },
      data: { name, ...privacy, coverAssetId, version: { increment: 1 } }
    });
    return {
      id: album.id,
      version: saved.version,
      message: "Album saved. Each photo keeps its source audience."
    };
  });
}
