import { photoLibraryEnabled } from "./personal-photo-policy";
import { socialUserWhere } from "./social-policy";
import type { PrismaClient } from "@prisma/client";
import { activePublicAccount, publicProfileSelect } from "./public-profile";
import { defaultProfileStyle } from "./profile-style";
import { listImagesIn } from "./media";
import { hydratePostPage, listPostsIn } from "./post-reads";
import { postReadableWhere, withPostRead } from "./post-access";
import { PortalError } from "./portal-policy";
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
  query: {
    before?: Date | null;
    cursor?: string | null;
    preview?: string;
    photos?: boolean;
  } = {}
) {
  return withPostRead(db, token, async (tx, context) => {
    if (!context.actorId)
      throw new PortalError(401, "Sign in to view member profiles.");
    const profile = await tx.platformUser.findFirst({
      where: { username, ...socialUserWhere(context) },
      select: {
        ...publicProfileSelect,
        locationAudience: true,
        locationRecoveryRequired: true,
        socialPreferences: {
          select: { showRelationships: true, profilePinPostId: true }
        },
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
    const pinId = profile.socialPreferences?.profilePinPostId;
    // Keep private selection metadata out of the DTO. Only a currently readable,
    // personally authored canonical card may be displayed as the profile pin.
    const pin =
      pinId && !(query.photos && photoLibraryEnabled())
        ? ((await hydratePostPage(tx, reader, [pinId]))[0] ?? null)
        : null;
    const pinnedPost =
      pin?.author.id === profile.id &&
      !pin.author.churchId &&
      (pin.repost?.kind !== "PLAIN" || pin.repost.source)
        ? pin
        : null;
    const posts =
      query.photos && photoLibraryEnabled()
        ? []
        : await listPostsIn(tx, reader, {
            before: query.before,
            cursor: query.cursor,
            authorId: profile.id,
            excludePostId: pinnedPost?.id,
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
    const {
      socialPreferences,
      locationAudience,
      locationRecoveryRequired,
      ...visibleProfile
    } = profile;
    const relationshipsVisible =
      (profile.id === context.actorId && !memberPreview) ||
      socialPreferences?.showRelationships !== false;
    return {
      ...visibleProfile,
      location:
        (profile.id === context.actorId && !memberPreview) ||
        (locationAudience === "MEMBERS" && !locationRecoveryRequired)
          ? profile.location
          : null,
      // Never serialize a private participation choice to another member or
      // a member preview. The owner edits it through getProfileEditor.
      role:
        visibleProfile.role === "EXPLORING_FAITH" ? null : visibleProfile.role,
      relationshipsVisible,
      _count: relationshipsVisible
        ? profile._count
        : { followers: null, following: null },
      presentation: profile.presentation ?? defaultProfileStyle,
      avatar,
      cover,
      posts,
      pinnedPost: query.before && query.cursor ? null : pinnedPost,
      postCount: count,
      following,
      isMe: profile.id === context.actorId,
      memberPreview,
      photoLibraryEnabled: photoLibraryEnabled()
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
        locationAudience: true,
        locationVersion: true,
        locationRecoveryRequired: true,
        presentation: { select: profilePresentationSelect }
      }
    });
    return {
      ...profile,
      canShareLocation: !!context.eligible,
      presentation: profile.presentation ?? defaultProfileStyle,
      imagesAvailable: imagesAvailable(),
      photoLibraryEnabled: photoLibraryEnabled(),
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
