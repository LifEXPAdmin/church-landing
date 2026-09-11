import { socialUserWhere } from "./social-policy";
import type { PrismaClient } from "@prisma/client";
import { activePublicAccount, publicProfileSelect } from "./public-profile";
import { defaultProfileStyle } from "./profile-style";
import { listImagesIn } from "./media";
import { listPostsIn } from "./post-reads";
import { postReadableWhere, withPostRead } from "./post-access";
import { PortalError } from "./portal";
import { imagesAvailable } from "./media-storage";

export const profilePresentationSelect = {
  version: true,
  palette: true,
  background: true,
  sectionOrder: true,
  introduction: true
} as const;
export function getVisitorProfilePreview(
  db: PrismaClient,
  token: unknown,
  username: string
) {
  return withPostRead(db, token, async (tx, context) => {
    if (!context.actorId)
      throw new PortalError(401, "Sign in to preview your profile.");
    // This reader returns only the public author identity, including to React's
    // development diagnostics. Do not load profile fields or media for it.
    const profile = await tx.platformUser.findFirst({
      where: { id: context.actorId, username, ...activePublicAccount },
      select: { name: true, username: true }
    });
    if (!profile) throw new PortalError(404, "This preview is unavailable.");
    return profile;
  });
}
export function getMemberProfile(
  db: PrismaClient,
  token: unknown,
  username: string,
  query: { before?: Date | null; cursor?: string | null; preview?: string } = {}
) {
  return withPostRead(db, token, async (tx, context) => {
    if (!context.actorId)
      throw new PortalError(401, "Sign in to view member profiles.");
    const profile = await tx.platformUser.findFirst({
      where: { username, ...socialUserWhere(context) },
      select: {
        ...publicProfileSelect,
        socialPreferences: { select: { showRelationships: true } },
        presentation: { select: profilePresentationSelect },
        _count: {
          select: {
            followers: { where: { follower: socialUserWhere(context) } },
            following: { where: { following: socialUserWhere(context) } }
          }
        }
      }
    });
    if (!profile) throw new PortalError(404, "This profile is unavailable.");
    const memberPreview =
      profile.id === context.actorId && query.preview === "member";
    // A generic member has no assumed church connections or ownership powers.
    const reader = memberPreview
      ? {
          actorId: null,
          churches: [],
          publishers: new Set<string>(),
          moderators: new Set<string>(),
          volunteers: new Set<string>()
        }
      : context;
    const avatar =
      (await listImagesIn(tx, context, "PROFILE_AVATAR", profile.id))[0] ??
      null;
    const cover =
      (await listImagesIn(tx, context, "PROFILE_COVER", profile.id))[0] ?? null;
    const posts = await listPostsIn(tx, reader, {
      before: query.before,
      cursor: query.cursor,
      authorId: profile.id,
      limit: 31
    });
    const count = await tx.platformPost.count({
      where: {
        AND: [
          { authorId: profile.id, authorChurchId: null },
          postReadableWhere(reader)
        ]
      }
    });
    const following = !!(await tx.platformFollow.findUnique({
      where: {
        followerId_followingId: {
          followerId: context.actorId,
          followingId: profile.id
        }
      },
      select: { id: true }
    }));
    const { socialPreferences, ...visibleProfile } = profile;
    const relationshipsVisible =
      (profile.id === context.actorId && !memberPreview) ||
      socialPreferences?.showRelationships !== false;
    return {
      ...visibleProfile,
      relationshipsVisible,
      _count: relationshipsVisible
        ? profile._count
        : { followers: null, following: null },
      presentation: profile.presentation ?? defaultProfileStyle,
      avatar,
      cover,
      posts,
      postCount: count,
      following,
      isMe: profile.id === context.actorId,
      memberPreview
    };
  });
}
export function getProfileEditor(db: PrismaClient, token: unknown) {
  return withPostRead(db, token, async (tx, context) => {
    if (!context.actorId)
      throw new PortalError(401, "Sign in to edit your profile.");
    const profile = await tx.platformUser.findUniqueOrThrow({
      where: { id: context.actorId },
      select: {
        ...publicProfileSelect,
        presentation: { select: profilePresentationSelect }
      }
    });
    return {
      ...profile,
      presentation: profile.presentation ?? defaultProfileStyle,
      imagesAvailable: imagesAvailable(),
      avatar:
        (await listImagesIn(tx, context, "PROFILE_AVATAR", profile.id))[0] ??
        null,
      cover:
        (await listImagesIn(tx, context, "PROFILE_COVER", profile.id))[0] ??
        null
    };
  });
}
export type ProfileEditorView = Awaited<ReturnType<typeof getProfileEditor>>;
export type MemberProfileView = Awaited<ReturnType<typeof getMemberProfile>>;
