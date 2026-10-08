import type { Prisma, PrismaClient } from "@prisma/client";
import { projectImage } from "./media";
import { withPostRead, type PostContext, type PostTx } from "./post-access";
import { postId } from "./post-input";
import { PortalError } from "./portal-policy";
import { socialUserWhere } from "./social-policy";
import { profilePhotoIds, readProfileModules } from "./profile-modules";
import {
  PHOTO_PAGE_SIZE,
  readableAssetWhere,
  requirePhotoLibrary
} from "./personal-photo-policy";

function photoWhere(
  context: PostContext,
  profileId: string
): Prisma.MediaAssetWhereInput {
  return {
    AND: [
      {
        purpose: "PROFILE_PHOTO",
        profileUserId: profileId,
        status: "READY",
        personalPhoto: { ownerId: profileId, deletedAt: null, hiddenAt: null }
      },
      readableAssetWhere(context)
    ]
  };
}
function references(value: unknown) {
  try {
    return profilePhotoIds(value);
  } catch {
    throw new PortalError(
      400,
      "Choose up to six distinct saved profile photos."
    );
  }
}
function owner(context: PostContext, expectedOwner: string | null) {
  if (!expectedOwner || context.actorId !== expectedOwner)
    throw new PortalError(
      401,
      "Your sign-in changed. Reload before continuing."
    );
  return expectedOwner;
}

/** Resolves current metadata only; saved references never confer image access. */
export async function profilePhotoImagesIn(
  tx: PostTx,
  context: PostContext,
  profileId: string,
  ids: string[]
) {
  const selected = references(ids);
  if (!selected.length) return [];
  const images = await tx.mediaAsset.findMany({
    where: { AND: [photoWhere(context, profileId), { id: { in: selected } }] },
    take: 6
  });
  const byId = new Map(images.map((image) => [image.id, image]));
  return selected.flatMap((id) => {
    const image = byId.get(id);
    return image ? [projectImage(image)] : [];
  });
}

export function getProfilePhotoChoices(
  db: PrismaClient,
  token: unknown,
  input: { after?: unknown; ids?: unknown },
  expectedOwner: string | null
) {
  requirePhotoLibrary();
  if (
    Object.keys(input).some((key) => !["after", "ids"].includes(key)) ||
    (input.after !== undefined && input.ids !== undefined)
  )
    throw new PortalError(
      400,
      "Choose one profile photo page or saved selection."
    );
  const after = input.after === undefined ? null : postId(input.after);
  const selected = input.ids === undefined ? null : references(input.ids);
  return withPostRead(db, token, async (tx, context) => {
    const viewerId = owner(context, expectedOwner);
    if (!context.eligible)
      throw new PortalError(
        403,
        "A verified adult account is required to choose profile photos."
      );
    if (selected)
      return {
        viewerId,
        images: await profilePhotoImagesIn(tx, context, viewerId, selected),
        nextCursor: null
      };
    // The cursor can only skip within this freshly authorized owner's sources.
    const rows = await tx.mediaAsset.findMany({
      where: {
        AND: [
          photoWhere(context, viewerId),
          ...(after ? [{ id: { lt: after } }] : [])
        ]
      },
      orderBy: { id: "desc" },
      take: PHOTO_PAGE_SIZE + 1
    });
    const page = rows.slice(0, PHOTO_PAGE_SIZE);
    return {
      viewerId,
      images: page.map(projectImage),
      nextCursor:
        rows.length > PHOTO_PAGE_SIZE ? page[page.length - 1].id : null
    };
  });
}

export function getProfilePhotoSection(
  db: PrismaClient,
  token: unknown,
  username: string,
  memberPreview: boolean,
  expectedOwner: string | null
) {
  requirePhotoLibrary();
  return withPostRead(db, token, async (tx, context) => {
    const viewerId = owner(context, expectedOwner);
    const profile = await tx.platformUser.findFirst({
      where: { username, ...socialUserWhere(context) },
      select: {
        id: true,
        presentation: { select: { version: true, modules: true } }
      }
    });
    if (!profile) throw new PortalError(404, "This profile is unavailable.");
    const reader: PostContext =
      memberPreview && profile.id === viewerId
        ? {
            actorId: "member-preview",
            churches: [],
            publishers: new Set(),
            moderators: new Set(),
            volunteers: new Set()
          }
        : context;
    return {
      viewerId,
      profileId: profile.id,
      version: profile.presentation?.version ?? 0,
      images: await profilePhotoImagesIn(
        tx,
        reader,
        profile.id,
        readProfileModules(profile.presentation?.modules).photoIds ?? []
      )
    };
  });
}
